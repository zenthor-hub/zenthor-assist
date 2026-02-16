import { httpRouter } from "convex/server";

import { webhook as clerkWebhook } from "./clerk/http";
import { incoming as telegramIncoming } from "./telegram/webhook";
import {
  incoming as whatsappCloudIncoming,
  verify as whatsappCloudVerify,
} from "./whatsappCloud/webhook";

const http = httpRouter();

http.route({
  path: "/clerk/webhook",
  method: "POST",
  handler: clerkWebhook,
});

http.route({
  path: "/whatsapp-cloud/webhook",
  method: "GET",
  handler: whatsappCloudVerify,
});

http.route({
  path: "/whatsapp-cloud/webhook",
  method: "POST",
  handler: whatsappCloudIncoming,
});

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: telegramIncoming,
});

export default http;
