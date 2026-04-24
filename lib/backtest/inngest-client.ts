/**
 * Shared Inngest client instance for the Atlas application.
 *
 * id: "atlas" — matches the app ID used in the Inngest dashboard.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "atlas" });
