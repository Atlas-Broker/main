import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest";
import { runBacktest } from "@/lib/backtest";
import {
  premarketCron,
  openCron,
  midmorningCron,
  middayCron,
  afternoonCron,
  closeCron,
  onPipelineTriggered,
} from "@/lib/scheduler";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runBacktest,
    premarketCron,
    openCron,
    midmorningCron,
    middayCron,
    afternoonCron,
    closeCron,
    onPipelineTriggered,
  ],
});
