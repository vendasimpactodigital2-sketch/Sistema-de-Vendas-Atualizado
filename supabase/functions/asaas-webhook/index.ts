import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle OPTIONS requests for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    const body = await req.json();
    console.log("[Asaas Webhook] Corpo completo do webhook recebido:", JSON.stringify(body, null, 2));

    const { event, payment } = body;

    const tokenAsaas = req.headers.get("asaas-access-token");
    const secret = Deno.env.get("ASAAS_WEBHOOK_SECRET");
    if (secret && tokenAsaas !== secret) {
      console.warn(`[Asaas Webhook] Token enviado ("${tokenAsaas}") não bate com o ASAAS_WEBHOOK_SECRET configurado.`);
      return new Response("Não autorizado", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    if (!payment) {
      console.error("[Asaas Webhook] Corpo da requisição não contém dados de pagamento.");
      return new Response(JSON.stringify({ received: true, error: "Dados de pagamento ausentes" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const usuarioIdNoSupabase = payment.externalReference;
      const clienteIdNoAsaas = payment.customer;

      console.log(`[Asaas Webhook] Liberando acesso do usuário: ${usuarioIdNoSupabase}, Cliente Asaas: ${clienteIdNoAsaas}`);

      if (!usuarioIdNoSupabase) {
        console.error("[Asaas Webhook] externalReference (ID do usuário no banco) está em branco no pagamento.");
        return new Response(JSON.stringify({ received: true, error: "externalReference não encontrado" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

      if (!supabaseUrl || !supabaseKey) {
        console.error("[Asaas Webhook] Chaves de conexão do Supabase não configuradas nas variáveis de ambiente da Edge Function.");
        return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Tenta atualizar a tabela "users" que é a tabela principal do nosso sistema
      console.log("[Asaas Webhook] Atualizando tabela 'users'...");
      let { error: updateError } = await supabase
        .from("users")
        .update({
          status_assinatura: "ativo",
          asaas_customer_id: clienteIdNoAsaas
        })
        .eq("id", usuarioIdNoSupabase);

      if (updateError) {
        console.warn("[Asaas Webhook] Falha ao atualizar 'users' com asaas_customer_id, tentando apenas status_assinatura...", updateError.message);
        
        // Fallback: Tenta atualizar apenas status_assinatura em "users"
        const fallback = await supabase
          .from("users")
          .update({
            status_assinatura: "ativo"
          })
          .eq("id", usuarioIdNoSupabase);
        
        updateError = fallback.error;
      }

      // Tenta também na tabela "profiles" para total compatibilidade caso tenham essa tabela
      try {
        console.log("[Asaas Webhook] Atualizando tabela 'profiles' por compatibilidade...");
        await supabase
          .from("profiles")
          .update({
            status_assinatura: "ativo",
            asaas_customer_id: clienteIdNoAsaas
          })
          .eq("id", usuarioIdNoSupabase);
      } catch (profileErr: any) {
        console.log("[Asaas Webhook] Tabela 'profiles' ignorada ou inexistente:", profileErr.message || profileErr);
      }

      if (updateError) {
        console.error("[Asaas Webhook] Erro crítico ao atualizar usuário no Supabase:", updateError);
        return new Response(JSON.stringify({ error: "Erro ao atualizar dados no banco de dados", details: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      console.log(`[Asaas Webhook] Usuário ${usuarioIdNoSupabase} ativado com sucesso!`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("[Asaas Webhook] Erro interno no processamento:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
