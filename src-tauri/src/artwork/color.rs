//! Color dominante de una portada, para usarlo como acento en la ficha del juego.
//! Histograma de 512 cubos (3 bits por canal) ponderado por saturación; se descarta lo casi
//! blanco/negro y el resultado se ajusta a un rango de luminosidad legible.

pub fn dominant_color(bytes: &[u8]) -> Option<String> {
    let img = image::load_from_memory(bytes).ok()?.thumbnail(48, 48).to_rgb8();
    let mut weight = [0f32; 512];
    let mut sum = [[0f32; 3]; 512];

    for p in img.pixels() {
        let [r, g, b] = p.0;
        let (_, s, l) = rgb_to_hsl(r, g, b);
        if !(0.08..=0.92).contains(&l) {
            continue;
        }
        let w = 1.0 + s * 3.0;
        let idx = ((r as usize >> 5) << 6) | ((g as usize >> 5) << 3) | (b as usize >> 5);
        weight[idx] += w;
        sum[idx][0] += r as f32 * w;
        sum[idx][1] += g as f32 * w;
        sum[idx][2] += b as f32 * w;
    }

    let (best, &w) = weight.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1))?;
    if w == 0.0 {
        return None;
    }
    let r = sum[best][0] / w;
    let g = sum[best][1] / w;
    let b = sum[best][2] / w;

    // Asegura que sirva como color de botón: saturado y ni muy oscuro ni muy claro.
    let (h, s, l) = rgb_to_hsl(r as u8, g as u8, b as u8);
    let (r, g, b) = hsl_to_rgb(h, s.max(0.45), l.clamp(0.42, 0.62));
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let (r, g, b) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if max == min {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    } / 6.0;
    (h, s, l)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (u8, u8, u8) {
    let hue = |p: f32, q: f32, mut t: f32| {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let f = |v: f32| (v * 255.0).round().clamp(0.0, 255.0) as u8;
    (f(hue(p, q, h + 1.0 / 3.0)), f(hue(p, q, h)), f(hue(p, q, h - 1.0 / 3.0)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hsl_roundtrip() {
        let (h, s, l) = rgb_to_hsl(200, 40, 60);
        let (r, g, b) = hsl_to_rgb(h, s, l);
        assert!((r as i32 - 200).abs() <= 1 && (g as i32 - 40).abs() <= 1 && (b as i32 - 60).abs() <= 1);
    }

    #[test]
    fn solid_image_gives_its_color() {
        let img = image::RgbImage::from_pixel(8, 8, image::Rgb([30, 90, 200]));
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
        let c = dominant_color(buf.get_ref()).unwrap();
        assert!(c.starts_with('#') && c.len() == 7, "{c}");
    }
}
