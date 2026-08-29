const API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

const WEB_URL =
  process.env.NEXT_PUBLIC_WEB_BASE_URL ||
  "http://localhost:3000";

import { brand, brandTitle } from "@/config/brand";

function sharePaths(type, accessId) {
  const encoded = encodeURIComponent(accessId);

  if (type === "public") {
    return {
      info: `${API_URL}/v1/public/${encoded}`,
      content: `${API_URL}/v1/public/${encoded}/content`,
      page: `${WEB_URL}/p/${encoded}`,
    };
  }

  return {
    info: `${API_URL}/v1/s/${encoded}`,
    content: `${API_URL}/v1/s/${encoded}/content`,
    page: `${WEB_URL}/s/${encoded}`,
  };
}

async function getShareInfo(type, accessId) {
  const { info } = sharePaths(type, accessId);

  const response = await fetch(info, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function mediaType(contentType) {
  const normalizedContentType = typeof contentType === "string" ? contentType : "";
  if (normalizedContentType.startsWith("image/")) return "image";
  if (normalizedContentType.startsWith("video/")) return "video";
  if (normalizedContentType.startsWith("audio/")) return "audio";

  return "file";
}

export async function generateShareMetadata(type, accessId) {
  const paths = sharePaths(type, accessId);
  const data = await getShareInfo(type, accessId);

  if (!data?.item) {
    return {
      title: brandTitle("Shared file"),
      description: "This shared file is unavailable.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const file = data.item;
  const kind = mediaType(file.contentType);

  const metadata = {
    title: brandTitle(file.name),
    description: `${file.name} — shared via ${brand.name}`,

    alternates: {
      canonical: paths.page,
    },

    openGraph: {
      title: file.name,
      description: `Shared via ${brand.name}`,
      url: paths.page,
      siteName: brand.name,
      type: "website",
    },

    twitter: {
      title: file.name,
      description: `Shared via ${brand.name}`,
    },

    robots:
      type === "private"
        ? {
            index: false, //don't index private urls
            follow: false,
          }
        : undefined,
  };

  if (kind === "image") {
    metadata.openGraph.images = [
      {
        url: paths.content,
        type: file.contentType,
        alt: file.name,
      },
    ];

    metadata.twitter.card = "summary_large_image";
    metadata.twitter.images = [paths.content];
  }

  if (kind === "video") {
    metadata.openGraph.videos = [
      {
        url: paths.content,
        type: file.contentType,
      },
    ];
  }

  if (kind === "audio") {
    metadata.openGraph.audio = [
      {
        url: paths.content,
        type: file.contentType,
      },
    ];
  }

  return metadata;
}
