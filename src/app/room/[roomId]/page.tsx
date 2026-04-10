import Whiteboard from "@/components/Whiteboard";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function RoomPage({ params }: Props) {
  const { roomId } = await params;
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <Whiteboard roomId={roomId} />
    </div>
  );
}
