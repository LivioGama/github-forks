import { EventEmitter } from "events";
import { ScanProgress } from "@/types";

export interface JobState {
  jobId: string;
  stage: string;
  progress: number;
  message: string;
  processedCount: number;
  totalCount: number;
  timestamp: Date;
}

export interface ProgressPayload {
  jobId: string;
  stage: string;
  progress: number;
  message: string;
  processedCount: number;
  totalCount: number;
  timestamp: string;
}

const jobStates = new Map<string, JobState>();
const jobEmitters = new Map<string, EventEmitter>();

export function getJobEmitter(jobId: string): EventEmitter {
  let emitter = jobEmitters.get(jobId);
  if (!emitter) {
    emitter = new EventEmitter();
    jobEmitters.set(jobId, emitter);
  }
  return emitter;
}

export function updateJobProgress(jobId: string, progress: ScanProgress): void {
  const state: JobState = { ...progress, timestamp: new Date() };
  jobStates.set(jobId, state);
  getJobEmitter(jobId).emit("progress", state);
}

export function getJobProgress(jobId: string): JobState | undefined {
  return jobStates.get(jobId);
}

export function clearJob(jobId: string): void {
  jobStates.delete(jobId);
  jobEmitters.delete(jobId);
}

export function formatProgressPayload(progress: JobState): ProgressPayload {
  return {
    jobId: progress.jobId,
    stage: progress.stage,
    progress: progress.progress,
    message: progress.message,
    processedCount: progress.processedCount,
    totalCount: progress.totalCount,
    timestamp: progress.timestamp.toISOString(),
  };
}
