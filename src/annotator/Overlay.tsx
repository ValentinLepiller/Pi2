import { Pi2Mark } from "../components/Pi2Mark";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CursorClickIcon,
  HandPalmIcon,
  PaperPlaneTiltIcon,
  XIcon,
  ListBulletsIcon,
} from "@phosphor-icons/react";
import { request } from "../lib/messages";
import type { Annotation, SessionSummary } from "../lib/models";
import { describe, locate, ownElement, selectable } from "./dom";

type Current = SessionSummary & { annotations: Omit<Annotation, "screenshot">[] };
export function Overlay({ host, close }: { host: HTMLElement; close: () => void }) {
  const { t } = useTranslation();
  const [session, setSession] = useState<Current | null>(null);
  const [picking, setPicking] = useState(true);
  const [hover, setHover] = useState<Element | null>(null);
  const [selected, setSelected] = useState<Element | null>(null);
  const [editing, setEditing] = useState<string>();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState(false);
  const [success, setSuccess] = useState(false);
  const [, redraw] = useState(0);
  const busyRef = useRef(false);
  busyRef.current = busy;
  async function refresh() {
    const state = await request<Current | null>({ type: "current" });
    if (!state) {
      if (!busyRef.current) close();
      return;
    }
    setSession(state);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          redraw((n) => n + 1);
        });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!picking || selected || busy) return;
      setHover(selectable(e));
    };
    const down = (e: PointerEvent) => {
      if (picking && !selected && !busy && !ownElement(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const click = (e: MouseEvent) => {
      if (!picking || selected || busy || ownElement(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const element = selectable(e);
      if (element) {
        setSelected(element);
        setHover(null);
        setEditing(undefined);
        setBody("");
        setError("");
      } else if ((e.target as Element)?.tagName === "IFRAME")
        setError(
          t("Les éléments internes des iframes ne sont pas pris en charge dans cette version."),
        );
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) {
          setSelected(null);
          setEditing(undefined);
          setBody("");
        } else setPicking(false);
        setHover(null);
      }
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("click", click, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [picking, selected, busy, t]);
  async function save() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (editing) await request({ type: "edit", annotationId: editing, body });
      else {
        if (!selected) throw Error(t("Sélectionnez un élément."));
        host.setAttribute("data-pi2-capturing", "");
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        await request({ type: "capture", body, target: describe(selected) });
      }
      setSelected(null);
      setEditing(undefined);
      setBody("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("La capture a échoué."));
    } finally {
      host.removeAttribute("data-pi2-capturing");
      setBusy(false);
    }
  }
  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await request({ type: "remove", annotationId: editing });
      setSelected(null);
      setEditing(undefined);
      setBody("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError("");
    try {
      await request({ type: "submit" });
      setSuccess(true);
      setTimeout(close, 2000);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function edit(a: Current["annotations"][number]) {
    const element = locate(a.target.selector);
    setEditing(a.id);
    setSelected(element);
    setBody(a.body);
    setHover(null);
    setList(false);
  }
  const element = selected ?? hover;
  const rect = element?.isConnected ? element.getBoundingClientRect() : null;
  const editorVisible = selected || editing;
  const x = Math.max(12, Math.min((rect?.right ?? innerWidth - 340) + 14, innerWidth - 330));
  const y = Math.max(12, Math.min(rect?.top ?? 80, innerHeight - 300));
  if (success)
    return (
      <div className="vf">
        <div role="status" className="vf-notice vf-success">
          {t("Envoi enregistré. Vos feedbacks arrivent dans Notion.")}
        </div>
      </div>
    );
  if (!session) return null;
  return (
    <div className="vf">
      {rect && picking && (
        <div
          className="vf-highlight"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        >
          <span className="vf-highlight-label">{element?.tagName.toLowerCase()}</span>
        </div>
      )}
      {session.annotations.map((a, index) => {
        if (a.target.url !== location.href) return null;
        const el = locate(a.target.selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.bottom < 0 || r.top > innerHeight) return null;
        return (
          <button
            key={a.id}
            className="vf-marker"
            aria-label={t("Modifier l’annotation {{number}}", { number: index + 1 })}
            style={{ left: Math.max(12, r.left), top: Math.max(12, r.top) }}
            onClick={() => edit(a)}
          >
            {index + 1}
          </button>
        );
      })}
      {editorVisible && (
        <div className="vf-editor" style={{ left: x, top: y }}>
          <div className="vf-editor-title">
            <span>
              {t(editing ? "Modifier le feedback" : "Votre feedback")} ·{" "}
              {selected?.tagName.toLowerCase() ?? t("élément précédent")}
            </span>
            <button
              className="vf-close"
              aria-label={t("Fermer le commentaire")}
              onClick={() => {
                setSelected(null);
                setEditing(undefined);
                setBody("");
              }}
            >
              <XIcon size={14} />
            </button>
          </div>
          <textarea
            autoFocus
            aria-label={t("Commentaire")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            placeholder={t("Qu’est-ce qui devrait changer ici ?")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
            }}
          />
          <div className="vf-editor-actions">
            {editing ? (
              <button className="vf-btn danger" disabled={busy} onClick={() => void remove()}>
                {t("Supprimer")}
              </button>
            ) : (
              <span className="vf-hint">{t("Entrée pour ajouter")}</span>
            )}
            <button
              className="vf-btn primary"
              disabled={busy || !body.trim()}
              onClick={() => void save()}
            >
              {t(busy ? "Capture…" : editing ? "Enregistrer" : "Ajouter")}
              <span>↵</span>
            </button>
          </div>
        </div>
      )}
      {list && (
        <div className="vf-list">
          <h3>
            {t("Vos annotations")} ({session.annotations.length})
          </h3>
          {session.annotations.length ? (
            session.annotations.map((a, index) => (
              <button key={a.id} className="vf-list-item" onClick={() => edit(a)}>
                <span>{index + 1}</span>
                {a.body.slice(0, 150)}
              </button>
            ))
          ) : (
            <p>{t("Sélectionnez un élément pour ajouter votre premier retour.")}</p>
          )}
        </div>
      )}
      {error ? (
        <div role="alert" className="vf-notice vf-error">
          {error}
          <button className="vf-btn ghost" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : (
        session.consoleStatus === "unavailable" && (
          <div className="vf-notice">{session.consoleReason}</div>
        )
      )}
      <div className="vf-toolbar">
        <span className="vf-logo">
          <Pi2Mark size={24} />
        </span>
        <div className="vf-toolbar-caption">
          <strong>{session.destination.name}</strong>
          <span className="vf-console">
            <span className={`vf-dot ${session.consoleStatus === "recording" ? "" : "off"}`} />
            {t(session.consoleStatus === "recording" ? "Console active" : "Console arrêtée")} ·{" "}
            {session.logCount}
          </span>
        </div>
        <span className="vf-divider" />
        <button
          className={`vf-btn ${picking ? "active" : ""}`}
          disabled={busy}
          onClick={() => {
            setPicking(!picking);
            setHover(null);
          }}
        >
          {picking ? <CursorClickIcon size={17} /> : <HandPalmIcon size={17} />}{" "}
          {t(picking ? "Annoter" : "Naviguer")}
        </button>
        <button
          className="vf-btn ghost"
          disabled={busy}
          onClick={() => setList(!list)}
          aria-label={t("Afficher les annotations")}
        >
          <ListBulletsIcon size={17} />
          {session.annotations.length}
        </button>
        <button
          className="vf-btn primary"
          disabled={busy || !session.annotations.length || !!editorVisible}
          onClick={() => void send()}
        >
          <PaperPlaneTiltIcon size={16} />
          {t("Envoyer")} {session.annotations.length > 0 && session.annotations.length}
        </button>
        <button
          className="vf-close"
          disabled={busy}
          aria-label={t("Mettre en pause")}
          title={t("Fermer et conserver le brouillon")}
          onClick={() => {
            void request({ type: "pause" })
              .then(close)
              .catch((e) => setError(e.message));
          }}
        >
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
}
