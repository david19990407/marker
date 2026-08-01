"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SignedImage, SignedVideo } from "@/components/shared/signed-media";
import { uploadBlockMediaAction } from "@/lib/actions/homework-builder";
import {
  normalizeMediaConfig,
} from "@/lib/homework/structure";
import {
  isEmbeddableVideo,
  parseVideoUrl,
} from "@/lib/homework/video-embed";
import { formatFileSize } from "@/lib/utils/files";
import type {
  BuilderBlock,
  MediaAlignment,
  MediaConfig,
  MediaDisplaySize,
} from "@/lib/types";

type BlockUpdater = (prev: BuilderBlock) => BuilderBlock;

export function MediaBlockFields({
  block,
  assignmentId,
  onChange,
}: {
  block: BuilderBlock;
  assignmentId: string;
  onChange: (updater: BlockUpdater) => void;
}) {
  const kind =
    block.block_type === "image"
      ? "image"
      : block.block_type === "embedded_video"
        ? "video"
        : "download";
  const media = normalizeMediaConfig(block.mediaConfig, {
    external_url: block.external_url,
    transcript: block.captions_text,
    allow_download: block.allow_download,
    title: block.content,
    description: block.prompt ?? null,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patchMedia(patch: Partial<MediaConfig>) {
    onChange((prev) => {
      const nextMedia = normalizeMediaConfig({
        ...normalizeMediaConfig(prev.mediaConfig),
        ...patch,
      });
      return {
        ...prev,
        mediaConfig: nextMedia,
        external_url: nextMedia.external_url ?? prev.external_url,
        captions_text: nextMedia.transcript ?? prev.captions_text,
        allow_download: nextMedia.allow_download,
        content:
          kind === "download" && patch.title != null
            ? patch.title
            : prev.content,
        prompt:
          kind !== "image" && patch.description != null
            ? patch.description
            : prev.prompt,
      };
    });
  }

  function clearMedia() {
    patchMedia({
      storage_path: null,
      file_name: null,
      mime_type: null,
      file_size: null,
      resource_id: null,
      external_url: kind === "video" ? media.external_url : null,
    });
  }

  function onUpload(file: File | null) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadBlockMediaAction(assignmentId, kind, formData);
      if (result.error || !result.media) {
        setError(result.error ?? "Upload failed");
        return;
      }
      patchMedia({
        storage_path: result.media.storage_path,
        file_name: result.media.file_name,
        mime_type: result.media.mime_type,
        file_size: result.media.file_size,
        resource_id: result.media.resource_id,
      });
    });
  }

  const videoParsed = parseVideoUrl(media.external_url);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {kind === "image"
          ? "Image"
          : kind === "video"
            ? "Embedded video"
            : "Downloadable resource"}
      </p>

      {kind === "video" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Video URL
          </span>
          <Input
            value={media.external_url ?? ""}
            onChange={(e) => patchMedia({ external_url: e.target.value })}
            placeholder="YouTube, Vimeo, Stream embed, or MP4/WebM URL"
          />
          {media.external_url && !isEmbeddableVideo(videoParsed) ? (
            <p className="mt-1 text-xs text-rose-600">{videoParsed.reason}</p>
          ) : null}
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          {kind === "image"
            ? "Upload image (PNG, JPG, WebP, SVG)"
            : kind === "video"
              ? "Or upload MP4 / WebM"
              : "Upload file (PDF, Office, images, audio/video)"}
        </span>
        <Input
          type="file"
          accept={
            kind === "image"
              ? "image/png,image/jpeg,image/webp,image/svg+xml,.svg"
              : kind === "video"
                ? "video/mp4,video/webm"
                : ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.mp3,.mp4,.webm"
          }
          disabled={pending || !assignmentId}
          onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
        />
      </label>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {pending ? <p className="text-xs text-slate-500">Uploading…</p> : null}

      {media.storage_path || media.file_name ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span>
            {media.file_name}
            {media.file_size != null ? ` · ${formatFileSize(media.file_size)}` : ""}
            {media.mime_type ? ` · ${media.mime_type}` : ""}
          </span>
          <Button type="button" size="sm" variant="danger" onClick={clearMedia}>
            Remove file
          </Button>
        </div>
      ) : null}

      {kind === "image" ? (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Alt text
            </span>
            <Input
              value={media.alt_text ?? ""}
              onChange={(e) => patchMedia({ alt_text: e.target.value })}
              placeholder="Describe the image for accessibility"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Caption
            </span>
            <Input
              value={media.caption ?? ""}
              onChange={(e) => patchMedia({ caption: e.target.value })}
            />
          </label>
        </>
      ) : (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Display title
            </span>
            <Input
              value={media.title ?? block.content}
              onChange={(e) => patchMedia({ title: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Description
            </span>
            <Textarea
              value={media.description ?? block.prompt ?? ""}
              onChange={(e) => patchMedia({ description: e.target.value })}
              className="min-h-20"
            />
          </label>
        </>
      )}

      {kind === "video" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Transcript / captions
          </span>
          <Textarea
            value={media.transcript ?? ""}
            onChange={(e) => patchMedia({ transcript: e.target.value })}
            className="min-h-20"
          />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {kind === "image" ? (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Alignment
              </span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={media.alignment ?? "center"}
                onChange={(e) =>
                  patchMedia({ alignment: e.target.value as MediaAlignment })
                }
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Display size
              </span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={media.display_size ?? "large"}
                onChange={(e) =>
                  patchMedia({
                    display_size: e.target.value as MediaDisplaySize,
                  })
                }
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="full">Full width</option>
              </select>
            </label>
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={media.allow_download !== false}
            onChange={(e) => patchMedia({ allow_download: e.target.checked })}
          />
          Students can download this file
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Preview</p>
        {kind === "image" && (media.storage_path || media.external_url) ? (
          <figure>
            {media.storage_path ? (
              <SignedImage
                path={media.storage_path}
                alt={media.alt_text || "Preview"}
                className="max-h-56 w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.external_url!}
                alt={media.alt_text || "Preview"}
                className="max-h-56 w-full object-contain"
              />
            )}
            {media.caption ? (
              <figcaption className="mt-1 text-xs text-slate-500">
                {media.caption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        {kind === "video" && isEmbeddableVideo(videoParsed) ? (
          <div className="aspect-video overflow-hidden bg-black">
            {videoParsed.kind === "direct" ? (
              <video
                controls
                className="h-full w-full"
                src={videoParsed.embedUrl}
              />
            ) : (
              <iframe
                title="Video preview"
                src={videoParsed.embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        ) : null}

        {kind === "video" && media.storage_path ? (
          <SignedVideo path={media.storage_path} className="aspect-video w-full" />
        ) : null}

        {kind === "download" && (media.storage_path || media.external_url) ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <p className="font-medium text-slate-800">
              {media.title || media.file_name || "Resource"}
            </p>
            {media.description ? (
              <p className="text-xs text-slate-500">{media.description}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
