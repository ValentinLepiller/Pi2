import axios from "axios";
import { z } from "zod";

const repositoryUrl = "https://github.com/ValentinLepiller/Pi2";
export const releasesUrl = `${repositoryUrl}/releases/latest`;
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(z.object({ name: z.string(), state: z.string() })),
});

export function releaseUpdate(
  data: unknown,
  currentVersion: string,
  browser: "chrome" | "firefox",
) {
  const release = releaseSchema.parse(data);
  const version = versionSchema.parse(release.tag_name.replace(/^v/, ""));
  const current = versionSchema.parse(currentVersion).split(".").map(Number);
  const difference = version.split(".").map((part, index) => Number(part) - current[index]!);
  if ((difference.find((part) => part !== 0) ?? 0) <= 0) return null;
  const filename = `pi2-${version}-${browser}.zip`;
  const ready = release.assets.some(
    (asset) => asset.name === filename && asset.state === "uploaded",
  );
  return {
    version,
    downloadUrl: ready
      ? `${repositoryUrl}/releases/download/${encodeURIComponent(release.tag_name)}/${filename}`
      : null,
  };
}

export async function checkForUpdate(currentVersion: string, browser: "chrome" | "firefox") {
  let data: unknown;
  try {
    const response = await axios.get<unknown>(
      "https://api.github.com/repos/ValentinLepiller/Pi2/releases/latest",
      {
        timeout: 10_000,
        withCredentials: false,
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    data = response.data;
  } catch {
    throw Error("GitHub est indisponible pour le moment. Réessayez ou ouvrez les releases.");
  }
  try {
    return releaseUpdate(data, currentVersion, browser);
  } catch {
    throw Error("Cette release n’est pas reconnue. Retrouvez les fichiers sur GitHub.");
  }
}
