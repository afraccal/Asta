/**
 * Raccolta delle tracce di una videochiamata.
 *
 * Estratta dal componente perché è esattamente il punto in cui è nato un bug
 * vero: raccoglievo solo le tracce VIDEO, quindi la voce degli altri non
 * veniva mai riprodotta e il microfono sembrava rotto in entrambe le
 * direzioni. Isolata così, la regola si può verificare.
 *
 * I tipi sono strutturali e non quelli della libreria: servono a descrivere
 * cosa serve, non a legarsi a una versione dell'SDK.
 */

export interface PubblicazioneVideo {
  track?: { mediaStreamTrack?: MediaStreamTrack | null } | null;
}

export interface PubblicazioneAudio<T> {
  track?: T | null;
  isSubscribed?: boolean;
  isMuted?: boolean;
}

export interface PartecipanteRemoto<T> {
  identity: string;
  videoTrackPublications: Map<string, PubblicazioneVideo>;
  audioTrackPublications: Map<string, PubblicazioneAudio<T>>;
}

export interface PartecipanteLocale {
  identity: string;
  videoTrackPublications: Map<string, PubblicazioneVideo>;
  isMicrophoneEnabled: boolean;
}

export interface TracceRaccolte<T> {
  video: Map<string, MediaStreamTrack>;
  /** Solo le voci ALTRUI: riprodurre la propria darebbe l'eco. */
  voci: Map<string, T>;
  microfoniAperti: Set<string>;
}

export function raccogliTracce<T>(
  remoti: Iterable<PartecipanteRemoto<T>>,
  locale: PartecipanteLocale,
): TracceRaccolte<T> {
  const video = new Map<string, MediaStreamTrack>();
  const voci = new Map<string, T>();
  const microfoniAperti = new Set<string>();

  for (const p of remoti) {
    p.videoTrackPublications.forEach((pub) => {
      if (pub.track?.mediaStreamTrack) video.set(p.identity, pub.track.mediaStreamTrack);
    });
    p.audioTrackPublications.forEach((pub) => {
      if (pub.track) voci.set(p.identity, pub.track);
      if (pub.isSubscribed && !pub.isMuted) microfoniAperti.add(p.identity);
    });
  }

  locale.videoTrackPublications.forEach((pub) => {
    if (pub.track?.mediaStreamTrack) video.set(locale.identity, pub.track.mediaStreamTrack);
  });
  if (locale.isMicrophoneEnabled) microfoniAperti.add(locale.identity);

  return { video, voci, microfoniAperti };
}
