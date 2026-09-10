import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CursorClickIcon,
  NotionLogoIcon,
} from "@phosphor-icons/react";
import { Pi2Mark } from "../components/Pi2Mark";
import { Button } from "../components/Button";
import {
  destinationsForPage,
  notionId,
  isNotionUrl,
  originSchema,
  type Destination,
  type PublicConnection,
} from "../lib/models";
import { request, type Message } from "../lib/messages";
import { queryClient, stateQuery, type AppState } from "./client";

function useAction() {
  return useMutation({
    mutationFn: (message: Message) => request(message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["extension-state"] }),
  });
}
function ErrorNotice({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="notice error">
      {error.message}
    </p>
  ) : null;
}
export function App() {
  const { t } = useTranslation();
  const state = useQuery(stateQuery());
  const tab = useQuery({
    queryKey: ["active-tab"],
    queryFn: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
  });
  const url = tab.data?.url ?? "";
  const isNotion = isNotionUrl(url);
  return (
    <main className="popup">
      <header className="brand">
        <span className="brand-icon">
          <Pi2Mark size={28} />
        </span>
        <div>Pi2</div>
        {isNotion && <NotionLogoIcon className="context-icon" size={24} aria-label="Notion" />}
      </header>
      {state.isPending || tab.isPending ? (
        <p>{t("Ouverture…")}</p>
      ) : state.error || tab.error ? (
        <>
          <ErrorNotice error={state.error || tab.error} />
          <Button
            onClick={() => {
              void state.refetch();
              void tab.refetch();
            }}
          >
            {t("Réessayer")}
          </Button>
        </>
      ) : (
        state.data &&
        (isNotion ? (
          <NotionPopup key={url} state={state.data} url={url} />
        ) : !state.data.connections.length ? (
          <ConnectNotion />
        ) : (
          <SitePopup key={url} state={state.data} tab={tab.data} />
        ))
      )}
      {state.data?.shortcutError?.tabId === tab.data?.id && state.data?.shortcutError && (
        <ErrorNotice error={Error(state.data.shortcutError.message)} />
      )}
      <footer>
        <span>v{chrome.runtime.getManifest().version}</span>
      </footer>
    </main>
  );
}
function NotionAccess({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="card stack">
      <NotionLogoIcon size={28} />
      <h2>{t("Connecter Notion")}</h2>
      <p>{t("Créez un jeton dans le portail développeur de Notion, puis collez-le ci-dessous.")}</p>
      {children}
    </section>
  );
}
function ConnectNotion({
  onConnected,
  onCancel,
}: {
  onConnected?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const action = useAction();
  const form = useForm({
    defaultValues: { token: "" },
    onSubmit: async ({ value }) => {
      try {
        const connected = (await action.mutateAsync({
          type: "connect",
          token: value.token,
        })) as PublicConnection;
        form.reset();
        onConnected?.(connected.id);
      } catch {
        /* The mutation displays its error without clearing the input. */
      }
    },
  });
  return (
    <NotionAccess>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="token">
          {(field) => (
            <label className="field">
              {t("Jeton Notion")}
              <input
                type="password"
                autoComplete="off"
                required
                minLength={10}
                maxLength={1000}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <ErrorNotice error={action.error} />
        <Button disabled={action.isPending} type="submit">
          {t(action.isPending ? "Connexion…" : "Vérifier et connecter")}
          <ArrowRightIcon />
        </Button>
        <a
          className="token-link"
          href="https://www.notion.so/developers/tokens"
          target="_blank"
          rel="noreferrer"
        >
          {t("Connecter Notion")} ↗
        </a>
        {onCancel && (
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t("Annuler")}
          </Button>
        )}
      </form>
    </NotionAccess>
  );
}
function NotionPopup({ state, url }: { state: AppState; url: string }) {
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);
  const [connectionId, setConnectionId] = useState("");
  const connection = state.connections.find((c) => c.id === connectionId) ?? state.connections[0];
  let pageId = "";
  try {
    pageId = notionId(url);
  } catch {}
  return (
    <>
      {!connection || changing ? (
        <ConnectNotion
          onConnected={(id) => {
            setConnectionId(id);
            setChanging(false);
          }}
          onCancel={connection ? () => setChanging(false) : undefined}
        />
      ) : (
        <>
          <div className="connection row spread">
            <span className="row">
              <CheckCircleIcon size={18} />
              <span>{connection.name}</span>
            </span>
            <Button variant="ghost" onClick={() => setChanging(true)}>
              {t("Changer")}
            </Button>
          </div>
          {state.connections.length > 1 && (
            <label className="field">
              {t("Compte Notion")}
              <select value={connection.id} onChange={(e) => setConnectionId(e.target.value)}>
                {state.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pageId ? (
            <NotionDestination
              key={connection.id}
              state={state}
              url={url}
              connectionId={connection.id}
            />
          ) : (
            <p className="notice">
              {t(
                "Ouvrez la page ou la base Notion qui accueillera les feedbacks, puis cliquez sur Pi2.",
              )}
            </p>
          )}
        </>
      )}
    </>
  );
}
type Discovery = { destinations: Destination[]; pageId?: string; incompatible: boolean };
function NotionDestination({
  state,
  url,
  connectionId,
}: {
  state: AppState;
  url: string;
  connectionId: string;
}) {
  const { t } = useTranslation();
  const action = useAction();
  const [found, setFound] = useState<Discovery | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [site, setSite] = useState("");
  const [environment, setEnvironment] = useState("Staging");
  const [linkedOrigin, setLinkedOrigin] = useState("");
  const [localError, setLocalError] = useState<Error | null>(null);
  const choices = (
    found?.destinations ?? destinationsForPage(state.configuration.destinations, url)
  ).filter((d) => d.connectionId === connectionId);
  const selected = choices.find((d) => d.id === destinationId) ?? choices[0];
  return (
    <section className="card stack">
      <h2>{t("Recevoir les feedbacks ici")}</h2>
      {!selected && (
        <>
          <p>{t("Utilisez une base compatible ou créez votre base Feedbacks sur cette page.")}</p>
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() => {
              action.mutate(
                { type: "discover", connectionId, url },
                { onSuccess: (data) => setFound(data as Discovery) },
              );
            }}
          >
            {t("Vérifier la page")}
            <ArrowRightIcon />
          </Button>
          {found && (
            <>
              <p>
                {t(
                  found.incompatible
                    ? "Cette base n’a pas les colonnes attendues. Ouvrez une page pour y créer la base Feedbacks."
                    : "Cette page est accessible. Vous pouvez y créer votre base.",
                )}
              </p>
              {found.pageId && (
                <Button
                  disabled={action.isPending}
                  onClick={() => {
                    action.mutate(
                      { type: "prepare", connectionId, pageId: found.pageId! },
                      {
                        onSuccess: (data) =>
                          setFound({ ...found, destinations: data as Destination[] }),
                      },
                    );
                  }}
                >
                  {t("Créer la base Feedbacks ici")}
                </Button>
              )}
            </>
          )}
        </>
      )}
      {selected && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const origin = originSchema.safeParse(site);
            setLinkedOrigin("");
            if (!origin.success) {
              setLocalError(Error(t("Saisissez une URL http ou https complète.")));
              return;
            }
            setLocalError(null);
            action.mutate(
              {
                type: "associate",
                association: { origin: origin.data, destinationId: selected.id, environment },
              },
              {
                onSuccess: () => {
                  setLinkedOrigin(origin.data);
                  setSite("");
                },
              },
            );
          }}
        >
          {choices.length > 1 && (
            <label className="field">
              {t("Destination")}
              <select value={selected.id} onChange={(e) => setDestinationId(e.target.value)}>
                {choices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            {t("URL du site")}
            <input
              type="url"
              required
              placeholder="https://staging.monapp.fr"
              value={site}
              onChange={(e) => {
                setSite(e.target.value);
                setLinkedOrigin("");
              }}
            />
          </label>
          <label className="field">
            {t("Environnement")}
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              {["Staging", "Préproduction", "Test", "Local"].map((name) => (
                <option key={name}>{t(name)}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={action.isPending}>
            {t("Lier ce site")}
            <ArrowRightIcon />
          </Button>
        </form>
      )}
      <ErrorNotice error={localError || action.error} />
      {linkedOrigin && (
        <div role="status" className="notice">
          {t("Site lié. Ouvrez-le pour annoter.")}
          <a className="site-link" href={linkedOrigin} target="_blank" rel="noreferrer">
            {linkedOrigin} ↗
          </a>
        </div>
      )}
    </section>
  );
}
function SitePopup({ state, tab }: { state: AppState; tab?: chrome.tabs.Tab }) {
  const { t } = useTranslation();
  const action = useAction();
  const parsed = originSchema.safeParse(tab?.url ?? "");
  const origin = parsed.success ? parsed.data : "";
  const association = state.configuration.associations.find((a) => a.origin === origin);
  const missingNames = state.configuration.destinations.filter(
    (d) => d.pageName === undefined && state.connections.some((c) => c.id === d.connectionId),
  );
  const names = useQuery({
    queryKey: ["destination-names", missingNames.map((d) => d.id)],
    queryFn: () => request<Destination[]>({ type: "destinations" }),
    enabled: missingNames.length > 0,
    staleTime: Infinity,
  });
  const choices = (names.data ?? state.configuration.destinations).filter((d) =>
    state.connections.some((c) => c.id === d.connectionId),
  );
  const [selectedId, setSelectedId] = useState(association?.destinationId ?? "");
  const destination = choices.find((d) => d.id === selectedId);
  const begin = useMutation({
    mutationFn: async () => {
      if (!destination || !tab?.id) throw Error(t("Choisissez une page Notion."));
      await request({
        type: "associate",
        association: {
          origin,
          destinationId: destination.id,
          environment: association?.environment ?? "Test",
        },
      });
      await request({ type: "start", tabId: tab.id });
    },
    onSuccess: () => window.close(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["extension-state"] }),
  });
  const draft = state.sessions.find(
    (s) => s.origin === origin && s.destination.id === destination?.id && s.status === "draft",
  );
  const pending = state.sessions.find(
    (s) => s.origin === origin && ["queued", "sending", "failed"].includes(s.status),
  );
  return (
    <>
      {!origin ? (
        <p className="notice">
          {t("Pi2 fonctionne sur les pages web. Ouvrez Notion pour configurer votre destination.")}
        </p>
      ) : (
        <section className="card stack">
          <label className="field">
            {t("Envoyer les feedbacks à")}
            <select
              value={destination?.id ?? ""}
              disabled={begin.isPending || !choices.length}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="" disabled>
                {t(choices.length ? "Choisir une page Notion" : "Aucune page configurée")}
              </option>
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.pageName ?? d.name}
                </option>
              ))}
            </select>
          </label>
          {choices.length ? (
            <Button
              disabled={begin.isPending || !destination || !tab?.id}
              onClick={() => begin.mutate()}
            >
              <CursorClickIcon />
              {t(
                draft?.annotationCount ? "Reprendre les annotations" : "Commencer les annotations",
              )}
            </Button>
          ) : (
            <>
              <p>
                {t(
                  "Ouvrez la page Notion qui accueillera vos retours, puis configurez-la depuis Pi2.",
                )}
              </p>
              <Button
                onClick={() => {
                  void chrome.tabs.create({ url: "https://www.notion.so" });
                }}
              >
                {t("Ouvrir Notion")}
                <ArrowRightIcon />
              </Button>
            </>
          )}
          {names.error && (
            <p className="notice">
              {t("Le nom de certaines pages n’a pas pu être chargé.")}{" "}
              <button className="button button-ghost" onClick={() => void names.refetch()}>
                {t("Réessayer")}
              </button>
            </p>
          )}
        </section>
      )}
      {pending && (
        <div className="notice" role="status">
          {t(
            pending.status === "failed"
              ? "L’envoi a échoué. Vos annotations sont conservées."
              : "Envoi vers Notion en cours. Vos annotations sont conservées.",
          )}
          {pending.error && (
            <>
              <p>{pending.error}</p>
              <Button
                variant="secondary"
                disabled={action.isPending || pending.status === "sending"}
                onClick={() => action.mutate({ type: "retry", id: pending.id })}
              >
                {t("Réessayer l’envoi")}
              </Button>
            </>
          )}
        </div>
      )}
      <ErrorNotice error={begin.error || action.error} />
    </>
  );
}
