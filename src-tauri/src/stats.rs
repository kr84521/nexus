//! Estadísticas de actividad a partir de la tabla `sessions`.

use std::collections::HashSet;

use rusqlite::params;
use serde::Serialize;

use crate::db::Db;
use crate::error::AppResult;
use crate::library::now_ms;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayActivity {
    /// AAAA-MM-DD en hora local
    pub day: String,
    pub secs: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePlaytime {
    pub game_id: String,
    pub title: String,
    pub secs: i64,
    pub sessions: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEntry {
    pub game_id: String,
    pub title: String,
    pub started_at: i64,
    pub secs: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsReport {
    pub total_secs: i64,
    pub week_secs: i64,
    pub month_secs: i64,
    pub sessions_count: i64,
    pub games_played: i64,
    pub streak_days: i64,
    /// Un año de actividad diaria (solo días con juego)
    pub days: Vec<DayActivity>,
    pub top_all_time: Vec<GamePlaytime>,
    pub top_month: Vec<GamePlaytime>,
    pub recent: Vec<SessionEntry>,
}

const DAY_MS: i64 = 86_400_000;

pub fn compute(db: &Db) -> AppResult<StatsReport> {
    let now = now_ms();
    let conn = db.conn_for_stats();

    let (total_secs, sessions_count, games_played): (i64, i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(secs), 0), COUNT(*), COUNT(DISTINCT game_id) FROM sessions",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let since = |ms: i64| -> AppResult<i64> {
        Ok(conn.query_row(
            "SELECT COALESCE(SUM(secs), 0) FROM sessions WHERE started_at >= ?1",
            [now - ms],
            |r| r.get(0),
        )?)
    };
    let week_secs = since(7 * DAY_MS)?;
    let month_secs = since(30 * DAY_MS)?;

    let days: Vec<DayActivity> = {
        let mut st = conn.prepare(
            "SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS d, SUM(secs)
             FROM sessions WHERE started_at >= ?1 GROUP BY d ORDER BY d",
        )?;
        let rows = st.query_map([now - 371 * DAY_MS], |r| Ok(DayActivity { day: r.get(0)?, secs: r.get(1)? }))?;
        rows.collect::<Result<_, _>>()?
    };

    let top = |since_ms: Option<i64>| -> AppResult<Vec<GamePlaytime>> {
        let mut st = conn.prepare(
            "SELECT s.game_id, COALESCE(g.custom_title, g.title), SUM(s.secs), COUNT(*)
             FROM sessions s JOIN games g ON g.id = s.game_id
             WHERE s.started_at >= ?1
             GROUP BY s.game_id ORDER BY SUM(s.secs) DESC LIMIT 8",
        )?;
        let rows = st.query_map(params![since_ms.map(|m| now - m).unwrap_or(0)], |r| {
            Ok(GamePlaytime { game_id: r.get(0)?, title: r.get(1)?, secs: r.get(2)?, sessions: r.get(3)? })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    };
    let top_all_time = top(None)?;
    let top_month = top(Some(30 * DAY_MS))?;

    let recent: Vec<SessionEntry> = {
        let mut st = conn.prepare(
            "SELECT s.game_id, COALESCE(g.custom_title, g.title), s.started_at, s.secs
             FROM sessions s JOIN games g ON g.id = s.game_id
             ORDER BY s.started_at DESC LIMIT 20",
        )?;
        let rows = st.query_map([], |r| {
            Ok(SessionEntry { game_id: r.get(0)?, title: r.get(1)?, started_at: r.get(2)?, secs: r.get(3)? })
        })?;
        rows.collect::<Result<_, _>>()?
    };

    let today: String = conn.query_row("SELECT date('now', 'localtime')", [], |r| r.get(0))?;
    let streak_days = streak(&days.iter().map(|d| d.day.as_str()).collect(), &today);

    Ok(StatsReport {
        total_secs,
        week_secs,
        month_secs,
        sessions_count,
        games_played,
        streak_days,
        days,
        top_all_time,
        top_month,
        recent,
    })
}

/// Días seguidos con actividad terminando hoy o ayer (si hoy aún no se ha jugado, la racha sigue viva).
fn streak(played: &HashSet<&str>, today: &str) -> i64 {
    let Some(mut d) = parse_day(today) else { return 0 };
    if !played.contains(fmt_day(d).as_str()) {
        d = prev_day(d);
        if !played.contains(fmt_day(d).as_str()) {
            return 0;
        }
    }
    let mut n = 0;
    while played.contains(fmt_day(d).as_str()) {
        n += 1;
        d = prev_day(d);
    }
    n
}

// Aritmética de fechas mínima (días civiles) para no añadir una dependencia solo para la racha.
fn parse_day(s: &str) -> Option<(i64, u32, u32)> {
    let mut it = s.split('-');
    Some((it.next()?.parse().ok()?, it.next()?.parse().ok()?, it.next()?.parse().ok()?))
}
fn fmt_day((y, m, d): (i64, u32, u32)) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}
fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ => {
            if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
                29
            } else {
                28
            }
        }
    }
}
fn prev_day((y, m, d): (i64, u32, u32)) -> (i64, u32, u32) {
    if d > 1 {
        (y, m, d - 1)
    } else if m > 1 {
        (y, m - 1, days_in_month(y, m - 1))
    } else {
        (y - 1, 12, 31)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_streaks() {
        let played: HashSet<&str> = ["2026-03-01", "2026-02-28", "2026-02-27", "2026-02-20"].into_iter().collect();
        assert_eq!(streak(&played, "2026-03-01"), 3);
        assert_eq!(streak(&played, "2026-03-02"), 3, "ayer cuenta");
        assert_eq!(streak(&played, "2026-03-03"), 0);
        assert_eq!(prev_day((2024, 3, 1)), (2024, 2, 29));
        assert_eq!(prev_day((2026, 1, 1)), (2025, 12, 31));
    }
}
