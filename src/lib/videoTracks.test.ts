import { describe, expect, it } from "vitest";
import { raccogliTracce, type PartecipanteLocale, type PartecipanteRemoto } from "./videoTracks";

const finta = (nome: string) => ({ mediaStreamTrack: { id: nome } as unknown as MediaStreamTrack });

function remoto(
  identity: string,
  opzioni: { video?: boolean; audio?: string | null; sottoscritto?: boolean; muto?: boolean } = {},
): PartecipanteRemoto<string> {
  return {
    identity,
    videoTrackPublications: new Map(
      opzioni.video ? [["v", { track: finta(identity + "-video") }]] : [],
    ),
    audioTrackPublications: new Map(
      opzioni.audio !== undefined && opzioni.audio !== null
        ? [["a", { track: opzioni.audio, isSubscribed: opzioni.sottoscritto ?? true, isMuted: opzioni.muto ?? false }]]
        : [],
    ),
  };
}

const locale = (opzioni: { video?: boolean; mic?: boolean } = {}): PartecipanteLocale => ({
  identity: "io",
  videoTrackPublications: new Map(opzioni.video ? [["v", { track: finta("io-video") }]] : []),
  isMicrophoneEnabled: opzioni.mic ?? false,
});

describe("raccolta delle tracce della videochiamata", () => {
  it("raccoglie la VOCE degli altri, non solo il video", () => {
    // Regressione: prima venivano raccolte solo le tracce video, quindi non si
    // sentiva nessuno e il microfono sembrava rotto in entrambe le direzioni.
    const { voci } = raccogliTracce([remoto("marco", { video: true, audio: "voce-marco" })], locale());
    expect(voci.get("marco")).toBe("voce-marco");
  });

  it("non riproduce la propria voce, per non sentirsi in eco", () => {
    const { voci } = raccogliTracce([], locale({ mic: true }));
    expect(voci.has("io")).toBe(false);
  });

  it("include il proprio video, per vedersi nel proprio riquadro", () => {
    const { video } = raccogliTracce([], locale({ video: true }));
    expect(video.has("io")).toBe(true);
  });

  it("segna il microfono aperto solo se la traccia c'e', e' sottoscritta e non muta", () => {
    const { microfoniAperti } = raccogliTracce(
      [
        remoto("aperto", { audio: "a", sottoscritto: true, muto: false }),
        remoto("muto", { audio: "b", sottoscritto: true, muto: true }),
        remoto("nonSottoscritto", { audio: "c", sottoscritto: false, muto: false }),
        remoto("senzaAudio", { video: true }),
      ],
      locale(),
    );
    expect([...microfoniAperti].sort()).toEqual(["aperto"]);
  });

  it("considera aperto anche il proprio microfono quando lo si accende", () => {
    const { microfoniAperti } = raccogliTracce([], locale({ mic: true }));
    expect(microfoniAperti.has("io")).toBe(true);
  });

  it("chi ha solo la voce e non la telecamera viene comunque sentito", () => {
    const { video, voci } = raccogliTracce([remoto("solovoce", { audio: "v" })], locale());
    expect(video.has("solovoce")).toBe(false);
    expect(voci.has("solovoce")).toBe(true);
  });

  it("una stanza vuota non produce niente, senza rompersi", () => {
    const { video, voci, microfoniAperti } = raccogliTracce([], locale());
    expect(video.size).toBe(0);
    expect(voci.size).toBe(0);
    expect(microfoniAperti.size).toBe(0);
  });
});
