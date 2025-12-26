/**
 * TimelineVideo Component
 * 
 * Wrapper component that loads and renders a Timeline.
 * This is the entry point for Timeline-based video composition.
 */
import React from "react";
import { z } from "zod";
import { RenderTimeline } from "../renderer/remotion/renderTimeline";
import type { Timeline } from "../../spec/timeline.schema";

// Schema for TimelineVideo props
export const timelineVideoSchema = z.object({
  titleText: z.string().default(""),
  timeline: z.any(), // Timeline is validated separately
});

export type TimelineVideoProps = z.infer<typeof timelineVideoSchema>;

interface TimelineVideoComponentProps extends TimelineVideoProps {
  timeline: Timeline;
}

export const TimelineVideo: React.FC<TimelineVideoComponentProps> = ({
  titleText,
  timeline,
}) => {
  return <RenderTimeline timeline={timeline} titleText={titleText} />;
};

