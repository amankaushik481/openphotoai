/** Handler registry — one file per job type. Do not edit; edit the per-type files. */
import type { JobType } from "@/types/domain";
import type { JobHandler } from "./types";
import edit from "./edit";
import faceRestore from "./face-restore";
import generate from "./generate";
import inpaint from "./inpaint";
import multiPerson from "./multi-person";
import poseCopy from "./pose-copy";
import removeBackground from "./remove-background";
import talkingVideo from "./talking-video";
import train from "./train";
import tryOn from "./try-on";
import upscale from "./upscale";
import video from "./video";

export const handlers: { [K in JobType]: JobHandler<K> } = {
  train,
  generate,
  pose_copy: poseCopy,
  edit,
  inpaint,
  upscale,
  face_restore: faceRestore,
  remove_background: removeBackground,
  video,
  talking_video: talkingVideo,
  try_on: tryOn,
  multi_person: multiPerson,
};

export function getHandler<T extends JobType>(type: T): JobHandler<T> {
  return handlers[type] as JobHandler<T>;
}
