//! Parser mínimo del formato KeyValues/VDF de Valve (libraryfolders.vdf, appmanifest_*.acf).

use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub enum Vdf {
    Str(String),
    Obj(BTreeMap<String, Vdf>),
}

impl Vdf {
    /// Acceso por clave sin distinguir mayúsculas (Valve no es consistente).
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(m) => m.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Vdf::Str(_) => None,
        }
    }

    pub fn str(&self, key: &str) -> Option<&str> {
        match self.get(key)? {
            Vdf::Str(s) => Some(s),
            Vdf::Obj(_) => None,
        }
    }

    pub fn entries(&self) -> impl Iterator<Item = (&String, &Vdf)> {
        let map = match self {
            Vdf::Obj(m) => Some(m),
            Vdf::Str(_) => None,
        };
        map.into_iter().flat_map(|m| m.iter())
    }
}

pub fn parse(input: &str) -> Vdf {
    let tokens = tokenize(input);
    let mut pos = 0;
    Vdf::Obj(parse_obj(&tokens, &mut pos))
}

#[derive(Debug)]
enum Tok {
    Str(String),
    Open,
    Close,
}

fn tokenize(s: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' => out.push(Tok::Open),
            '}' => out.push(Tok::Close),
            '"' => {
                let mut buf = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => match chars.next() {
                            Some('n') => buf.push('\n'),
                            Some('t') => buf.push('\t'),
                            Some(o) => buf.push(o),
                            None => break,
                        },
                        '"' => break,
                        o => buf.push(o),
                    }
                }
                out.push(Tok::Str(buf));
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            c => {
                // Token sin comillas
                let mut buf = String::from(c);
                while let Some(&n) = chars.peek() {
                    if n.is_whitespace() || n == '{' || n == '}' || n == '"' {
                        break;
                    }
                    buf.push(n);
                    chars.next();
                }
                out.push(Tok::Str(buf));
            }
        }
    }
    out
}

fn parse_obj(t: &[Tok], pos: &mut usize) -> BTreeMap<String, Vdf> {
    let mut map = BTreeMap::new();
    while *pos < t.len() {
        match &t[*pos] {
            Tok::Close => {
                *pos += 1;
                break;
            }
            Tok::Open => {
                *pos += 1; // llave suelta, se ignora
            }
            Tok::Str(key) => {
                *pos += 1;
                match t.get(*pos) {
                    Some(Tok::Open) => {
                        *pos += 1;
                        map.insert(key.clone(), Vdf::Obj(parse_obj(t, pos)));
                    }
                    Some(Tok::Str(v)) => {
                        *pos += 1;
                        map.insert(key.clone(), Vdf::Str(v.clone()));
                    }
                    _ => break,
                }
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_library_folders() {
        let src = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps"
		{
			"228980"		"1234"
		}
	}
	"1" { "path" "D:\\SteamLibrary" }
}"#;
        let v = parse(src);
        let lf = v.get("LibraryFolders").unwrap();
        let paths: Vec<_> = lf.entries().filter_map(|(_, e)| e.str("path")).collect();
        assert_eq!(paths, vec![r"C:\Program Files (x86)\Steam", r"D:\SteamLibrary"]);
    }
}
