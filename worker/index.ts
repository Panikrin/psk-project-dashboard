import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

import { isPagesOrigin } from "../lib/client-origin";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const origin = request.headers.get('Origin');
    const api = new URL(request.url).pathname.startsWith('/api/');
    const crossClient = api && isPagesOrigin(origin);
    if (api && origin && origin !== new URL(request.url).origin && !crossClient)
      return Response.json({error:'Запрос с другого сайта запрещён.'},{status:403});
    const corsHeaders: Record<string,string> = crossClient ? {
      'Access-Control-Allow-Origin': origin!,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin, Authorization',
    } : {};
    if (api && request.method === 'OPTIONS')
      return new Response(null,{status:crossClient?204:403,headers:corsHeaders});
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if (!crossClient) return response;
    const headers = new Headers(response.headers);
    for (const [key,value] of Object.entries(corsHeaders)) headers.set(key,value);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};

export default worker;
