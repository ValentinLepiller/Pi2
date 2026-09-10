import { browser } from "wxt/browser";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "../components/Button";
import { checkForUpdate, releasesUrl } from "../lib/releases";

export function UpdateFooter() {
  const { t } = useTranslation();
  const version = browser.runtime.getManifest().version;
  const update = useMutation({
    networkMode: "always",
    mutationFn: () => checkForUpdate(version, import.meta.env.FIREFOX ? "firefox" : "chrome"),
  });
  return (
    <>
      <footer>
        <span>v{version}</span>
        <Button
          variant="ghost"
          className="update-button"
          disabled={update.isPending}
          aria-label={t("Vérifier les mises à jour")}
          onClick={() => update.mutate()}
        >
          <ArrowClockwiseIcon size={12} />
          {t(update.isPending ? "Vérification…" : "Mettre à jour")}
        </Button>
      </footer>
      {update.isError ? (
        <div className="notice error" role="alert">
          <p>{t(update.error.message)}</p>
          <a href={releasesUrl} target="_blank" rel="noreferrer">
            {t("Ouvrir GitHub")} ↗
          </a>
        </div>
      ) : (
        update.isSuccess && (
          <div className="notice update-notice" role="status">
            {!update.data ? (
              <p>{t("Pi2 est à jour.")}</p>
            ) : !update.data.downloadUrl ? (
              <p>
                {t(
                  "La version {{version}} est publiée. Son build n’est pas encore disponible ; réessayez dans quelques minutes.",
                  { version: update.data.version },
                )}
              </p>
            ) : (
              <>
                <a
                  className="site-link"
                  href={update.data.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Télécharger la version {{version}}", { version: update.data.version })} ↗
                </a>
                {import.meta.env.FIREFOX ? (
                  <p>
                    {t(
                      "Dans about:debugging → Ce Firefox, chargez le ZIP téléchargé comme module complémentaire temporaire. Il reste chargé jusqu’à la fermeture de Firefox.",
                    )}
                  </p>
                ) : (
                  <ol>
                    <li>
                      {t(
                        "Décompressez le ZIP et remplacez les fichiers dans le dossier actuel de Pi2.",
                      )}
                    </li>
                    <li>
                      {t(
                        "Dans la page des extensions, cliquez sur Recharger pour Pi2, puis rechargez le site.",
                      )}
                    </li>
                  </ol>
                )}
                <p>{t("Terminez votre annotation avant de recharger Pi2.")}</p>
                {!import.meta.env.FIREFOX && (
                  <Button
                    variant="ghost"
                    onClick={() => void browser.tabs.create({ url: "chrome://extensions" })}
                  >
                    {t("Ouvrir les extensions")} ↗
                  </Button>
                )}
              </>
            )}
          </div>
        )
      )}
    </>
  );
}
