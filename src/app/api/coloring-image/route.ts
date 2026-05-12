import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.HETZNER_S3_ENDPOINT!,
  region: process.env.HETZNER_S3_REGION ?? "eu-central",
  credentials: {
    accessKeyId: process.env.HETZNER_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.HETZNER_S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.HETZNER_S3_INTERN_BUCKET!;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !key.startsWith("coloring-pages/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!result.Body) return new NextResponse("Not found", { status: 404 });

  const bytes = await result.Body.transformToByteArray();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": result.ContentType ?? "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
