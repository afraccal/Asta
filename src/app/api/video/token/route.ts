import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Rilascia il permesso di entrare nella videochiamata di una stanza.
 *
 * Il controllo sta qui e non nel browser: chi chiede il permesso deve avere
 * una sessione valida ed essere gia' membro di quell'asta. E' la stessa
 * regola dell'asta stessa, applicata al video: il client non decide nulla.
 *
 * Se le chiavi LiveKit non sono configurate risponde 503 e il resto dell'app
 * si comporta come se il video non esistesse. La videochiamata e' un extra:
 * la sua assenza non deve mai fermare un'asta.
 */
export async function POST(request: Request) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "video_non_configurato" }, { status: 503 });
  }

  let auctionId: string;
  try {
    ({ auctionId } = await request.json());
    if (typeof auctionId !== "string" || auctionId.length === 0) throw new Error();
  } catch {
    return NextResponse.json({ error: "richiesta_malformata" }, { status: 400 });
  }

  const supabase = await getSupabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "non_autenticato" }, { status: 401 });
  }

  // La verifica passa dal database, con le stesse regole dell'asta.
  const { data: membro, error } = await supabase.rpc("is_auction_member", {
    p_auction_id: auctionId,
  });
  if (error || membro !== true) {
    return NextResponse.json({ error: "non_membro" }, { status: 403 });
  }

  const { data: profilo } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profilo?.display_name ?? "Ospite",
    // Se la scheda resta aperta a lungo il token scade e la connessione cade:
    // un'asta puo' durare due ore.
    ttl: "4h",
  });

  token.addGrant({
    room: `asta-${auctionId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    // Nessuno deve poter creare stanze arbitrarie o gestire quelle altrui.
    roomCreate: false,
    roomAdmin: false,
  });

  return NextResponse.json({ url, token: await token.toJwt() });
}
