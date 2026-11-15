import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

/** Tráiler de fondo en silencio y en bucle. Reproduce HLS (.m3u8) mediante hls.js y mp4/webm en nativo. */
export function TrailerVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const isHls = src.includes(".m3u8");
    if (!isHls) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }
    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }
    const hls = new Hls({ enableWorker: true, maxBufferLength: 20, startLevel: -1, capLevelToPlayerSize: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) setFailed(true);
    });
    return () => hls.destroy();
  }, [src]);

  if (failed) {
    return poster ? <img src={poster} alt="" className="size-full object-cover" draggable={false} /> : null;
  }
  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}
