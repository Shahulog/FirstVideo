/**
 * TimelineVideo Component
 * 
 * Wrapper component that renders a Timeline.
 * Timeline is validated with Zod in Root.tsx before being passed here.
 */
import React from "react";
import { z } from "zod";
import { RenderTimeline } from "../renderer/remotion/renderTimeline";
import { timelineSchema, type Timeline } from "../../spec/timeline.schema";

// Schema for TimelineVideo props - timeline is properly typed with Zod
export const timelineVideoSchema = z.object({
  titleText: z.string().default(""),
  timeline: timelineSchema,
});

export type TimelineVideoProps = z.infer<typeof timelineVideoSchema>;

export const TimelineVideo: React.FC<TimelineVideoProps> = ({
  titleText,
  timeline,
}) => {
  return <RenderTimeline timeline={timeline as Timeline} titleText={titleText} />;
};
