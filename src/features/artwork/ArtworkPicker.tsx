import { open } from "@tauri-apps/plugin-dialog";
import { Check, Loader2, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { artSrc, displayTitle } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import type { ArtKind, ArtOption, Game, SgdbGame } from "@/types";

const KINDS: { kind: ArtKind; label: string; aspect: string }[] = [
  { kind: "cover", label: "Portada", aspect: "aspect-[2/3]" },
  { kind: "hero", label: "Fondo", aspect: "aspect-[96/31]" },
  { kind: "logo", label: "Logo", aspect: "aspect-[2/1]" },
  { kind: "icon", label: "Icono", aspect: "aspect-square" },
];

export function ArtworkPicker({ game, open: isOpen, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const upsert = useLibrary((s) => s.upsert);
  const hasKey = useSettings((s) => !!s.sgdbApiKey);
  const [kind, setKind] = useState<ArtKind>("cover");
  const [options, setOptions] = useState<ArtOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const [matchMode, setMatchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SgdbGame[]>([]);

  const current = artSrc(game, kind);
  const meta = KINDS.find((k) => k.kind === kind)!;

  useEffect(() => {
    if (!isOpen || !hasKey) return;
    let alive = true;
    setLoading(true);
    setOptions(null);
    api
      .artOptions(game.id, kind)
      .then((o) => alive && setOptions(o))
      .catch((e) => alive && toast.error(errorText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isOpen, kind, game.id, game.sgdbId, hasKey]);

  const apply = async (o: ArtOption) => {
    setApplying(o.id);
    try {
      upsert(await api.setArtFromUrl(game.id, kind, o.url));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setApplying(null);
    }
  };

  const pickFile = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "Imagen", extensions: ["png", "jpg", "jpeg", "webp", "gif", "ico"] }],
    });
    if (typeof file !== "string") return;
    try {
      upsert(await api.setArtFromFile(game.id, kind, file));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const clear = async () => {
    try {
      upsert(await api.clearArt(game.id, kind));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const search = async () => {
    try {
      setMatches(await api.sgdbSearch(query || displayTitle(game)));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const chooseMatch = async (m: SgdbGame) => {
    try {
      upsert(await api.setSgdbGame(game.id, m.id));
      toast.success(`Arte de "${m.name}" en descarga`);
      setMatchMode(false);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={`Arte · ${displayTitle(game)}`} width="max-w-5xl">
      <div className="flex h-[70vh] min-h-0">
        {/* Lateral: tipo de arte + actual */}
        <aside className="flex w-56 shrink-0 flex-col gap-3 border-r border-line p-4">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={`focus-ring rounded-card px-3 py-2 text-left text-sm transition ${
                kind === k.kind ? "bg-accent/16 font-medium text-fg" : "text-muted hover:bg-fg/6 hover:text-fg"
              }`}
            >
              {k.label}
            </button>
          ))}
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Actual</div>
          <div className={`${meta.aspect} w-full overflow-hidden rounded-card bg-surface-2 ring-1 ring-line`}>
            {current && <img src={current} alt="" className="size-full object-contain" />}
          </div>
          <Button variant="outline" size="sm" onClick={pickFile}>
            <Upload size={14} /> Subir imagen
          </Button>
          {current && (
            <Button variant="danger" size="sm" onClick={clear}>
              <Trash2 size={14} /> Quitar
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={() => setMatchMode((v) => !v)} className="text-xs">
            <Search size={13} /> ¿Juego equivocado?
          </Button>
        </aside>

        {/* Opciones */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!hasKey ? (
            <Hint>Añade tu API key de SteamGridDB en Ajustes para ver portadas alternativas. Mientras tanto puedes subir imágenes propias.</Hint>
          ) : matchMode ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={query}
                  placeholder={displayTitle(game)}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                />
                <Button variant="primary" onClick={search}>
                  Buscar
                </Button>
              </div>
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => chooseMatch(m)}
                  className={`focus-ring flex items-center justify-between rounded-card border border-line px-4 py-2.5 text-left text-sm hover:bg-fg/6 ${
                    m.id === game.sgdbId ? "border-accent" : ""
                  }`}
                >
                  <span>{m.name}</span>
                  <span className="text-xs text-muted">
                    {m.releaseDate ? new Date(m.releaseDate * 1000).getFullYear() : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : loading ? (
            <Hint>
              <Loader2 className="animate-spin" size={18} /> Buscando en SteamGridDB…
            </Hint>
          ) : !options || options.length === 0 ? (
            <Hint>No hay alternativas para este tipo. Prueba a subir una imagen propia.</Hint>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${kind === "cover" ? 140 : kind === "icon" ? 110 : 220}px, 1fr))` }}
            >
              {options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => apply(o)}
                  disabled={applying !== null}
                  title={[o.style, o.author && `por ${o.author}`, `${o.width}×${o.height}`].filter(Boolean).join(" · ")}
                  className={`focus-ring group relative ${meta.aspect} overflow-hidden rounded-card bg-surface-2 ring-1 ring-line transition hover:ring-accent`}
                >
                  <img src={o.thumb} alt="" loading="lazy" className="size-full object-contain" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                    {applying === o.id ? <Loader2 className="animate-spin text-white" /> : <Check className="text-white" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center gap-2 p-8 text-center text-sm text-muted">{children}</div>;
}
