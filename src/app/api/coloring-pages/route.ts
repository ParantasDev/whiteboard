import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export async function GET() {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: "coloring-pages/",
  }));

  const objects = (result.Contents ?? []).filter(
    (obj) => obj.Key && obj.Key !== "coloring-pages/" && obj.Key.endsWith(".svg")
  );

  const pages = await Promise.all(
    objects.map(async (obj) => {
      const key = obj.Key!;
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        { expiresIn: 3600 }
      );
      const filename = key.replace("coloring-pages/", "");
      const name = filename.replace(/\.svg$/i, "").replace(/[-_]/g, " ");
      return { filename, name, url };
    })
  );

  return NextResponse.json(pages);
}
