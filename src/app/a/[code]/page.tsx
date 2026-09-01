import { redirect } from "next/navigation";

export default async function AuctionEntryPage({ params }: PageProps<"/a/[code]">) {
  const { code } = await params;
  redirect(`/a/${code.toUpperCase()}/lobby`);
}
