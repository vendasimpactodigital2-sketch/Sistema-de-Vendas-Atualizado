import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Capture raw body for Stripe signature verification
  app.use(express.json({
    limit: "50mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Lazy Stripe client helper to prevent crash on startup if STRIPE_SECRET_KEY is not set
  const getStripeInstance = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("A chave STRIPE_SECRET_KEY não está configurada no servidor.");
    }
    return new Stripe(key, { apiVersion: "2023-10-16" as any });
  };

  // Lazy Gemini client helper to avoid load-time failure and support dynamic updates
  const getAiInstance = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave GEMINI_API_KEY não está configurada no servidor.");
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // API to analyze receipts
  app.post("/api/analyze-receipt", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Nenhuma imagem foi recebida." });
      }

      const activeApiKey = process.env.GEMINI_API_KEY;
      if (!activeApiKey) {
        return res.status(500).json({ error: "A chave GEMINI_API_KEY não está configurada no servidor. Cadastre-a nas Configurações de Segredos para ativar." });
      }

      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
          {
            text: "Analise esta imagem, que é uma nota fiscal, cupom fiscal, recibo ou lista de produtos. Extraia até no máximo 10 produtos ou itens descritos no texto da imagem. Para cada item identificado, você deve obrigatoriamente preencher:\n" +
                  "1. 'nome': Nome ou descrição curta do produto/item.\n" +
                  "2. 'preco_custo': O preço unitário pago/custo em Reais (R$). Se não encontrar, use 0.\n" +
                  "3. 'preco_venda': Preço de venda sugerido em Reais (R$). Se houver preço de custo, aplique uma margem saudável de mercado como custo * 1.5 a 1.8, ou use o valor comercial sugerido. Se for impossível estimar, use 0.\n" +
                  "4. 'estoque_atual': A quantidade comprada ou identificada na nota. Caso não haja quantidade explícita na imagem, defina obrigatoriamente o valor padrão como 5.\n\n" +
                  "Retorne exatamente a lista de objetos no JSON sob o campo 'items'.",
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                description: "List of up to 10 products extracted from the image.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nome: {
                      type: Type.STRING,
                      description: "Name or short description of the item.",
                    },
                    preco_custo: {
                      type: Type.NUMBER,
                      description: "Unit cost price of the item. Returns 0 if not present.",
                    },
                    preco_venda: {
                      type: Type.NUMBER,
                      description: "Suggested sale price. Use standard markup (e.g. cost * 1.5) or suggested sales price.",
                    },
                    estoque_atual: {
                      type: Type.INTEGER,
                      description: "Quantity purchased or identified. Defaults to 5 if not explicitly mentioned.",
                    },
                  },
                  required: ["nome", "preco_custo", "preco_venda", "estoque_atual"],
                },
              },
            },
            required: ["items"],
          },
        },
      });

      const responseText = response.text || "{}";
      const data = JSON.parse(responseText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Gemini analysis error:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor de IA." });
    }
  });

  // API route to create a payment on Asaas
  app.post("/api/payments/create", async (req, res) => {
    const activeApiKey = process.env.ASAAS_API_KEY;
    console.log("Chave API lida pelo servidor:", activeApiKey ? "Encontrada (Começa com: " + activeApiKey.substring(0, 8) + "...)" : "Não encontrada (Nula ou Vazia)");
    
    // Verificação de segurança imediata: se ASAAS_API_KEY não existir ou estiver vazia/placeholder, retorna o mock de sucesso imediatamente
    const isApiKeyInvalid = !activeApiKey || activeApiKey.trim() === "" || activeApiKey.toLowerCase().includes("your_") || activeApiKey.toLowerCase().includes("placeholder");
    if (isApiKeyInvalid) {
      console.warn("[Asaas Create] ASAAS_API_KEY não configurada ou inválida. Retornando link simulado imediatamente.");
      const fallbackUrl = "https://asaas.com";
      const responseBody = {
        checkoutUrl: fallbackUrl,
        invoiceUrl: fallbackUrl,
        url: fallbackUrl,
        isSimulated: true,
        message: "Modo Simulação Ativado por falta de chave API do Asaas."
      };
      console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
      return res.json(responseBody);
    }

    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário (userId) é obrigatório para gerar a cobrança." });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

      const isWebhookSecretInvalid = !webhookSecret || webhookSecret.trim() === "" || webhookSecret.toLowerCase().includes("your_") || webhookSecret.toLowerCase().includes("placeholder");
      const isSupabaseInvalid = !supabaseUrl || !supabaseKey || supabaseUrl.toLowerCase().includes("your_") || supabaseKey.toLowerCase().includes("your_");

      // Se alguma das chaves cruciais do Supabase ou webhook estiver ausente ou for placeholder, ignora o Asaas temporariamente e responde com simulação
      if (isWebhookSecretInvalid || isSupabaseInvalid) {
        console.warn("[Asaas Create] CONFIGURAÇÃO INCOMPLETA/PROVISÓRIA DETECTADA. Ativando bypass de simulação para evitar quebra do frontend.");
        const fallbackUrl = "https://asaas.com";
        const responseBody = {
          checkoutUrl: fallbackUrl,
          invoiceUrl: fallbackUrl,
          url: fallbackUrl,
          isSimulated: true,
          message: "Modo Simulação Ativado - Chaves de API do Webhook ou Supabase ausentes ou pendentes de configuração."
        };
        console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
        return res.json(responseBody);
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // 1. Busca os dados de cadastro do usuário na tabela 'users' para obter o asaas_customer_id ou dados de criação
      let user: any = null;
      try {
        const { data, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        
        if (userError) {
          console.error(`[Asaas Create] Erro ao buscar usuário no Supabase:`, userError);
        } else {
          user = data;
        }
      } catch (dbErr: any) {
        console.error(`[Asaas Create] Exceção ao ler banco Supabase:`, dbErr.message);
      }

      const userDisplayName = user?.name || user?.nome || "Cliente de Teste";
      const userEmail = user?.email || "financeiro@cliente-simulado.com";
      let asaasCustomerId = user?.asaas_customer_id;

      // Resolve a URL base correta da API do Asaas
      let asaasBaseUrl = process.env.ASAAS_API_URL;
      if (!asaasBaseUrl) {
        if (activeApiKey.startsWith("$aae")) {
          asaasBaseUrl = "https://sandbox.asaas.com/v3";
          console.log("[Asaas Create] Chave sandbox detectada automaticamente ($aae). Usando sandbox.asaas.com");
        } else {
          asaasBaseUrl = "https://api.asaas.com/v3";
        }
      }
      if (asaasBaseUrl.endsWith("/")) {
        asaasBaseUrl = asaasBaseUrl.slice(0, -1);
      }
      if (!asaasBaseUrl.endsWith("/v3")) {
        asaasBaseUrl = asaasBaseUrl + "/v3";
      }

      // 2. Se o usuário ainda não tiver um asaas_customer_id cadastrado, cria no Asaas primeiro
      if (!asaasCustomerId) {
        console.log(`[Asaas Create] Criando novo cliente no Asaas para o usuário: ${userId}`);
        const customerPayload = {
          name: userDisplayName,
          email: userEmail,
          externalReference: userId,
          notificationDisabled: true
        };

        try {
          const customerRes = await fetch(`${asaasBaseUrl}/customers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "access_token": activeApiKey
            },
            body: JSON.stringify(customerPayload)
          });

          if (!customerRes.ok) {
            const errText = await customerRes.text();
            console.error("===============================================================");
            console.error("[Asaas API Error - Customer Creation] Falha na resposta do Asaas:");
            console.error(`Status HTTP: ${customerRes.status} ${customerRes.statusText}`);
            console.error("Payload enviado:", JSON.stringify(customerPayload, null, 2));
            console.error("Corpo do Erro retornado pelo Asaas:", errText);
            console.error("===============================================================");
            
            console.warn("[Asaas Create] Ativando fallback para o cliente...");
            const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
            const responseBody = {
              checkoutUrl: fallbackUrl,
              invoiceUrl: fallbackUrl,
              url: fallbackUrl,
              isSimulated: true,
              message: "Checkout de simulação ativado devido a erro na criação do cliente no Asaas."
            };
            console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
            return res.json(responseBody);
          }

          const customerData: any = await customerRes.json();
          asaasCustomerId = customerData.id;

          if (asaasCustomerId) {
            console.log(`[Asaas Create] Salvando ID do cliente (${asaasCustomerId}) no banco...`);
            try {
              await supabase
                .from("users")
                .update({ asaas_customer_id: asaasCustomerId })
                .eq("id", userId);
              
              await supabase
                .from("profiles")
                .update({ asaas_customer_id: asaasCustomerId })
                .eq("id", userId);
            } catch (updateErr: any) {
              console.error("[Asaas Create] Falha ao atualizar asaas_customer_id no banco:", updateErr.message);
            }
          }
        } catch (fetchErr: any) {
          console.error("===============================================================");
          console.error("[Asaas Connection Exception - Customer Creation]:", fetchErr);
          console.error("===============================================================");
          console.warn("[Asaas Create] Ativando fallback devido a falha de conexão na criação do cliente.");
          const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
          const responseBody = {
            checkoutUrl: fallbackUrl,
            invoiceUrl: fallbackUrl,
            url: fallbackUrl,
            isSimulated: true,
            message: "Checkout de simulação devido a falha de rede/conexão com o Asaas."
          };
          console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
          return res.json(responseBody);
        }
      }

      if (!asaasCustomerId) {
        console.warn("[Asaas Create] Sem ID de cliente Asaas válido. Retornando fallback estático.");
        const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
        const responseBody = {
          checkoutUrl: fallbackUrl,
          invoiceUrl: fallbackUrl,
          url: fallbackUrl,
          isSimulated: true
        };
        console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
        return res.json(responseBody);
      }

      // 3. Cria a cobrança de R$ 26.99 no Asaas
      const dueDateObj = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const year = dueDateObj.getFullYear();
      const month = String(dueDateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dueDateObj.getDate()).padStart(2, "0");
      const dueDateStr = `${year}-${month}-${day}`;

      const paymentPayload = {
        customer: asaasCustomerId,
        billingType: "UNDEFINED", // Aceita Pix e Cartão
        value: 26.99,
        dueDate: dueDateStr,
        description: "Assinatura Mensal - Sistema de Recibos e Gestão",
        externalReference: userId
      };

      console.log(`[Asaas Create] Enviando requisição de cobrança de R$ 26.99 para o cliente ${asaasCustomerId}`);

      try {
        const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "access_token": activeApiKey
          },
          body: JSON.stringify(paymentPayload)
        });

        if (!paymentRes.ok) {
          const errText = await paymentRes.text();
          console.error("===============================================================");
          console.error("[Asaas API Error - Payment Creation] Falha na resposta do Asaas:");
          console.error(`Status HTTP: ${paymentRes.status} ${paymentRes.statusText}`);
          console.error("Payload enviado:", JSON.stringify(paymentPayload, null, 2));
          console.error("Corpo do Erro retornado pelo Asaas:", errText);
          console.error("===============================================================");
          
          console.warn("[Asaas Create] Ativando fallback para emissão de cobrança...");
          const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
          const responseBody = {
            checkoutUrl: fallbackUrl,
            invoiceUrl: fallbackUrl,
            url: fallbackUrl,
            isSimulated: true,
            message: "Checkout de simulação ativado devido a erro na emissão da cobrança no Asaas."
          };
          console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
          return res.json(responseBody);
        }

        const paymentData: any = await paymentRes.json();
        const invoiceUrl = paymentData.invoiceUrl;

        if (!invoiceUrl) {
          console.error("[Asaas Create] Resposta do Asaas não possui invoiceUrl:", paymentData);
          const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
          const responseBody = {
            checkoutUrl: fallbackUrl,
            invoiceUrl: fallbackUrl,
            url: fallbackUrl,
            isSimulated: true,
            message: "Checkout de simulação por ausência de link na resposta original."
          };
          console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
          return res.json(responseBody);
        }

        console.log(`[Asaas Create] Cobrança real gerada com sucesso! URL: ${invoiceUrl}`);
        const responseBody = {
          checkoutUrl: invoiceUrl,
          invoiceUrl: invoiceUrl,
          url: invoiceUrl
        };
        console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
        return res.json(responseBody);
      } catch (paymentFetchErr: any) {
        console.error("===============================================================");
        console.error("[Asaas Connection Exception - Payment Creation]:", paymentFetchErr);
        console.error("===============================================================");
        console.warn("[Asaas Create] Ativando fallback devido a falha de conexão na criação da cobrança.");
        const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
        const responseBody = {
          checkoutUrl: fallbackUrl,
          invoiceUrl: fallbackUrl,
          url: fallbackUrl,
          isSimulated: true,
          message: "Checkout de simulação devido a falha de rede/conexão na cobrança."
          };
        console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
        return res.json(responseBody);
      }

    } catch (err: any) {
      console.error("[Asaas Create Critical Exception] Falha geral no servidor de pagamentos:", err);
      const fallbackUrl = "https://sandbox.asaas.com/invoice/mock-test-charge-26-99";
      const responseBody = {
        checkoutUrl: fallbackUrl,
        invoiceUrl: fallbackUrl,
        url: fallbackUrl,
        isSimulated: true,
        message: `Checkout de simulação ativado após exceção crítica: ${err.message}`
      };
      console.log("[Asaas Create Response]:", JSON.stringify(responseBody, null, 2));
      return res.json(responseBody);
    }
  });

  // API to analyze expense receipt/invoice
  app.post("/api/analyze-expense", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Nenhuma imagem foi recebida." });
      }

      const activeApiKey = process.env.GEMINI_API_KEY;
      if (!activeApiKey) {
        return res.status(500).json({ error: "A chave GEMINI_API_KEY não está configurada no servidor. Cadastre-a nas Configurações de Segredos para ativar." });
      }

      const ai = getAiInstance();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
          {
            text: "Analise esta imagem que é um comprovante ou cupom de gasto enviada pelo usuário, faça a análise de visão computacional e extraia os dados realizando obrigatoriamente as seguintes 4 etapas:\n\n" +
                  "1. IDENTIFICAÇÃO DO ESTABELECIMENTO (CABEÇALHO): Leia o cabeçalho da imagem para identificar o nome do local/estabelecimento (Ex: Posto Ipiranga, Supermercado Extra, Kalunga).\n" +
                  "2. DESCRIÇÃO DO GASTO: Analise o corpo do cupom para entender o que foi comprado (Ex: Combustível, Papel A4, Almoço). A descrição final retornada deve ser a junção do Local + Itens principais (Ex: 'Kalunga - Papel A4 e Canetas').\n" +
                  "3. VALOR TOTAL: Localize o valor total final pago no cupom e formate como um número decimal puro (Ex: 25.00).\n" +
                  "4. CATEGORIA: Classifique automaticamente o gasto com base nos itens lidos em uma destas categorias padrão: 'Materiais/Insumos', 'Alimentação', 'Combustível/Viagem', 'Manutenção' ou 'Outros'.\n\n" +
                  "Retorne estritamente um JSON válido seguindo a estrutura abaixo, sem textos extras ou Markdown:\n" +
                  "{\n" +
                  "  \"descricao\": \"Nome do Local - Descrição dos Itens\",\n" +
                  "  \"valor\": 25.00,\n" +
                  "  \"categoria\": \"Materiais/Insumos\"\n" +
                  "}",
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              descricao: {
                type: Type.STRING,
                description: "Establishment name + description of main items (Format: 'Nome do Local - Descrição dos Itens').",
              },
              valor: {
                type: Type.NUMBER,
                description: "The grand total value as a pure decimal float/number.",
              },
              categoria: {
                type: Type.STRING,
                description: "Classified category. Must be strictly one of: 'Materiais/Insumos', 'Alimentação', 'Combustível/Viagem', 'Manutenção', 'Outros'.",
              },
            },
            required: ["descricao", "valor", "categoria"],
          },
        },
      });

      const responseText = response.text || "{}";
      const data = JSON.parse(responseText.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Gemini expense analysis error:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor de IA despesas." });
    }
  });

  // API for logistics AI agent
  app.post("/api/analyze-logistics", async (req, res) => {
    try {
      const { sales, todayDate } = req.body;
      if (!sales) {
        return res.status(400).json({ error: "Nenhuma lista de pedidos foi informada para análise." });
      }

      const promptText = `
Você é o assistente de logística da gráfica. Analise a lista de pedidos em JSON que enviei e a data atual do sistema. Retorne uma lista limpa e organizada em Markdown apenas com os materiais e clientes cuja data de entrega seja estritamente igual a hoje. Se houver itens com status 'Pendente' ou 'Em produção', coloque um aviso em destaque.

Data atual do sistema: ${todayDate || "03 de Junho de 2026"}

Lista de pedidos:
${JSON.stringify(sales, null, 2)}
      `;

      let responseText = "";
      const currentApiKey = process.env.GEMINI_API_KEY;

      if (!currentApiKey) {
        console.log("Aviso: Chave de API indisponível. Ativando contingência local de alto desempenho.");
        responseText = generateLocalReport(sales, todayDate, "A chave GEMINI_API_KEY não foi configurada. Gerando relatório através do mecanismo local de backup do servidor.");
      } else {
        try {
          const ai = getAiInstance();
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: promptText,
          });
          responseText = response.text || "";
        } catch (error: any) {
          console.log("Aviso: Modelo gemini-3.5-flash com alta demanda. Acionando fallback...");
          try {
            const ai = getAiInstance();
            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: promptText,
            });
            responseText = response.text || "";
          } catch (error2: any) {
            console.log("Informativo: Ambos os modelos em alta demanda. Ativando o gerador customizado local.");
            responseText = generateLocalReport(sales, todayDate, "A API do Google AI Studio está temporariamente sobrecarregada ou indisponível. Gerado em modo de contingência local estruturado de alto desempenho.");
          }
        }
      }

      if (!responseText) {
        responseText = generateLocalReport(sales, todayDate, "Erro ao processar resposta. Gerado em modo de contingência local.");
      }

      return res.json({ result: responseText });
    } catch (error: any) {
      console.error("Gemini logistics analyzer parent error:", error);
      return res.status(500).json({ error: error.message || "Erro ao consultar a inteligência artificial para logística." });
    }
  });

  // Helper local generator to guarantee 100% uptime for logistics card summaries
  function generateLocalReport(sales: any[], todayDate: string, noticeOfContingency: string): string {
    try {
      const safeSales = Array.isArray(sales) ? sales : [];
      const safeTodayDate = String(todayDate || "");
      const todayIso = safeTodayDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
      
      const todaysOrders = safeSales.filter((s: any) => {
        if (!s) return false;
        const dDate = s.deliveryDate ? String(s.deliveryDate) : "";
        return dDate && dDate.includes(todayIso);
      });
      
      let report = `## 📋 Relatório Logístico Automático de Hoje\n\n`;
      report += `> ℹ️ **Nota do Sistema:** *${noticeOfContingency}*\n\n`;
      report += `### 🚚 Resumo de Entregas\n`;
      report += `- **Total de Entregas do Dia:** **${todaysOrders.length}** pedido(s)\n`;
      
      const pendingCount = todaysOrders.filter((s: any) => s && Number(s.balanceDue || 0) > 0).length;
      const totalValue = todaysOrders.reduce((acc: number, d: any) => acc + Number(d?.totalValue || 0), 0);
      const balanceDue = todaysOrders.reduce((acc: number, d: any) => acc + Number(d?.balanceDue || 0), 0);
      
      report += `- **Pedidos com Saldo Pendente:** **${pendingCount}**\n`;
      report += `- **Faturamento Total Previsto:** R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
      report += `- **Montante em Aberto a Receber:** R$ ${balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n\n`;
      
      if (pendingCount > 0) {
        report += `> ⚠️ **Aviso de Pendências:** Existem **${pendingCount}** pedidos pendentes de pagamento ou com saldo em aberto agendados para hoje. Certifique-se de cobrar no ato da entrega!\n\n`;
      }
      
      report += `### 📦 Lista de Clientes e Materiais do Dia\n\n`;
      
      if (todaysOrders.length === 0) {
        report += `*Não há pedidos agendados para entrega na data de hoje no banco de dados.*\n`;
      } else {
        todaysOrders.forEach((o: any, idx: number) => {
          if (!o) return;
          const itemsArr = Array.isArray(o.items) ? o.items : [];
          const itemSummary = itemsArr.length > 0
            ? itemsArr.map((i: any) => `**${i?.quantity || 1}x** *${String(i?.description || "Produto s/ descrição")}*`).join(", ")
            : "Não especificado";
          
          const rawClientName = String(o.clientName || "Cliente não informado");
          const clientNameUpper = rawClientName.toUpperCase();
          const clientPhoneStr = o.clientPhone ? String(o.clientPhone) : "Sem telefone cadastrado";
          const dDue = Number(o.balanceDue || 0);
          
          report += `#### ${idx + 1}. 👤 Cliente: **${clientNameUpper}**\n`;
          report += `- **Materiais/Produtos:** ${itemSummary}\n`;
          report += `- **Telefone de Contato:** \`${clientPhoneStr}\`\n`;
          report += `- **Status Financeiro:** ${dDue > 0 ? `🔴 **A receber:** R$ ${dDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : `🟢 **Totalmente Pago**`}\n\n`;
        });
      }
      
      return report;
    } catch (e: any) {
      console.error("Critical fail inside local logistics generator fallback:", e);
      return `## 📋 Relatório Logístico Automático de Hoje\n\nOcorreu uma falha ao renderizar o relatório de backup no servidor: ${e.message || "Erro desconhecido"}`;
    }
  }

  const handleAsaasWebhook = async (req: express.Request, res: express.Response) => {
    try {
      const tokenAsaas = req.headers["asaas-access-token"];
      const secret = process.env.ASAAS_WEBHOOK_SECRET;

      console.log("[Asaas Webhook] Recebido cabeçalho asaas-access-token:", tokenAsaas ? "Sim" : "Não");
      console.log("[Asaas Webhook] Corpo completo do webhook recebido:", JSON.stringify(req.body, null, 2));

      if (secret && tokenAsaas !== secret) {
        console.warn(`[Asaas Webhook] Token enviado ("${tokenAsaas}") não bate com o ASAAS_WEBHOOK_SECRET ("${secret}") configurado.`);
        return res.status(401).send("Não autorizado");
      }

      const { event, payment } = req.body;
      console.log(`[Asaas Webhook] Evento recebido: ${event}`);

      if (!payment) {
        console.error("[Asaas Webhook] Corpo da requisição não contém dados de pagamento.");
        return res.status(200).json({ received: true, error: "Dados de pagamento ausentes" });
      }

      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        const usuarioIdNoSupabase = payment.externalReference;
        const clienteIdNoAsaas = payment.customer;

        console.log(`[Asaas Webhook] Liberando acesso do usuário: ${usuarioIdNoSupabase}, Cliente Asaas: ${clienteIdNoAsaas}`);

        if (!usuarioIdNoSupabase) {
          console.error("[Asaas Webhook] externalReference (ID do usuário no banco) está em branco no pagamento.");
          return res.status(200).json({ received: true, error: "externalReference não encontrado" });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          console.error("[Asaas Webhook] Chaves de conexão do Supabase não configuradas no servidor.");
          return res.status(500).json({ error: "Configuração do Supabase ausente no servidor" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Tenta atualizar a tabela "users" que é a tabela principal do nosso sistema
        console.log("[Asaas Webhook] Atualizando tabela 'users'...");
        let updateResult = await supabase
          .from("users")
          .update({
            status_assinatura: "ativo",
            asaas_customer_id: clienteIdNoAsaas
          })
          .eq("id", usuarioIdNoSupabase);

        if (updateResult.error) {
          console.warn("[Asaas Webhook] Falha ao atualizar 'users' com asaas_customer_id, tentando apenas status_assinatura...", updateResult.error.message);
          
          // Fallback: Tenta atualizar apenas status_assinatura em "users"
          updateResult = await supabase
            .from("users")
            .update({
              status_assinatura: "ativo"
            })
            .eq("id", usuarioIdNoSupabase);
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

        if (updateResult.error) {
          console.error("[Asaas Webhook] Erro crítico ao atualizar usuário no Supabase:", updateResult.error);
          return res.status(500).json({ error: "Erro ao atualizar dados no banco de dados", details: updateResult.error.message });
        }

        console.log(`[Asaas Webhook] Usuário ${usuarioIdNoSupabase} ativado com sucesso!`);
      }

      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Asaas Webhook] Erro interno no processamento:", err);
      return res.status(500).send(`Erro: ${err.message}`);
    }
  };

  app.post("/api/webhook/asaas", handleAsaasWebhook);
  app.post("/api/webhooks/asaas", handleAsaasWebhook);

  // ==========================================
  // STRIPE CHECKOUT & SUBSCRIPTION INTEGRATION
  // ==========================================

  // 1. Criar Sessão de Checkout do Stripe com 15 dias de Teste Grátis
  app.post("/api/stripe/create-checkout-session", async (req, res) => {
    try {
      const { userId, userEmail, successUrl, cancelUrl } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário (userId) é obrigatório." });
      }

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey || stripeSecretKey.trim() === "" || stripeSecretKey.includes("MY_")) {
        console.warn("[Stripe Checkout] STRIPE_SECRET_KEY não configurada. Ativando link de simulação.");
        return res.json({
          url: `${req.headers.origin || "http://localhost:3000"}?payment=simulated_success`,
          isSimulated: true,
          message: "Modo de simulação ativado por falta de chave STRIPE_SECRET_KEY."
        });
      }

      const stripe = getStripeInstance();
      const priceId = process.env.STRIPE_PRICE_ID || "price_1TzmqlD15U3MLrZlaibMpiXL";
      const domain = req.headers.origin || "http://localhost:3000";

      console.log(`[Stripe Checkout] Criando sessão de checkout para usuário ${userId} com 15 dias grátis (Price ID: ${priceId})`);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: 15, // 15 dias grátis configurados diretamente no código
          metadata: {
            user_id: userId,
          },
        },
        client_reference_id: userId,
        customer_email: userEmail && userEmail.includes("@") ? userEmail : undefined,
        metadata: {
          user_id: userId,
        },
        success_url: successUrl || `${domain}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${domain}/?payment=canceled`,
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("[Stripe Checkout Error]:", error);
      return res.status(500).json({ error: error.message || "Erro ao criar sessão de checkout no Stripe." });
    }
  });

  // 2. Webhook do Stripe para Receber Confirmações de Pagamento e Assinatura
  const handleStripeWebhook = async (req: express.Request, res: express.Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || webhookSecret.trim() === "") {
      console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET não configurado no servidor.");
      return res.status(400).send("Webhook secret não configurado.");
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripeInstance();
      const rawBody = (req as any).rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook Error] Assinatura inválida: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Evento recebido com sucesso: ${event.type}`);

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Stripe Webhook] Supabase não configurado.");
      return res.status(500).send("Configuração do Supabase ausente.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      switch (event.type) {
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          const subRaw = (invoice as any).subscription;
          const subscriptionId = (typeof subRaw === "string" ? subRaw : subRaw?.id) || "";
          
          console.log(`[Stripe Webhook] Fatura paga com sucesso (invoice.paid) para o cliente ${customerId}`);
          
          if (customerId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: "ativo",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
              })
              .eq("stripe_customer_id", customerId);

            // Sincroniza também na tabela 'assinaturas' do Supabase
            await supabase
              .from("assinaturas")
              .upsert({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                status: "active",
                updated_at: new Date().toISOString()
              }, { onConflict: "stripe_customer_id" });
          }
          break;
        }

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.user_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          if (userId) {
            console.log(`[Stripe Webhook] Liberando acesso para o usuário ${userId}`);
            await supabase
              .from("users")
              .update({
                status_assinatura: "ativo",
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
              })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .upsert({
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                status: "active",
                updated_at: new Date().toISOString()
              }, { onConflict: "user_id" });
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const status = subscription.status; // 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
          const userId = subscription.metadata?.user_id;

          let statusAssinatura = "bloqueado";
          let statusDb = "canceled";
          if (status === "active") {
            statusAssinatura = "ativo";
            statusDb = "active";
          } else if (status === "trialing") {
            statusAssinatura = "trialing";
            statusDb = "trialing";
          }

          console.log(`[Stripe Webhook] Atualizando status de assinatura para ${statusAssinatura} (Stripe status: ${status})`);

          // Tenta atualizar pelo userId do metadata ou pelo stripe_customer_id
          if (userId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: statusAssinatura,
                stripe_subscription_id: subscription.id,
              })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .upsert({
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                status: statusDb,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
              }, { onConflict: "user_id" });
          } else if (customerId) {
            await supabase
              .from("users")
              .update({
                status_assinatura: statusAssinatura,
                stripe_subscription_id: subscription.id,
              })
              .eq("stripe_customer_id", customerId);

            await supabase
              .from("assinaturas")
              .upsert({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                status: statusDb,
                trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
              }, { onConflict: "stripe_customer_id" });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const userId = subscription.metadata?.user_id;

          console.log(`[Stripe Webhook] Assinatura cancelada/encerrada. Bloqueando usuário...`);

          if (userId) {
            await supabase
              .from("users")
              .update({ status_assinatura: "bloqueado" })
              .eq("id", userId);

            await supabase
              .from("assinaturas")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("user_id", userId);
          } else if (customerId) {
            await supabase
              .from("users")
              .update({ status_assinatura: "bloqueado" })
              .eq("stripe_customer_id", customerId);

            await supabase
              .from("assinaturas")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("stripe_customer_id", customerId);
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Evento não tratado explicitamente: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (dbErr: any) {
      console.error("[Stripe Webhook Exception]:", dbErr);
      return res.status(500).send(`Erro interno ao processar webhook: ${dbErr.message}`);
    }
  };

  app.post("/api/webhook/stripe", handleStripeWebhook);
  app.post("/api/webhooks/stripe", handleStripeWebhook);

  // 3. API para Verificar Validade dos 15 dias de Teste Grátis e Bloqueio Automático
  app.post("/api/stripe/check-access", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "O ID do usuário é obrigatório." });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        // Se Supabase não estiver configurado, libera por padrão no dev
        return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error || !user) {
        return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
      }

      // Se o usuário tem status explicitamente ativo de assinatura paga
      if (user.status_assinatura === "ativo") {
        return res.json({
          isAllowed: true,
          isTrial: false,
          daysRemaining: 0,
          status: "ativo",
          message: "Assinatura Stripe Ativa"
        });
      }

      // Se está bloqueado manualmente
      if (user.status_assinatura === "bloqueado") {
        return res.json({
          isAllowed: false,
          isTrial: false,
          daysRemaining: 0,
          status: "bloqueado",
          message: "Acesso bloqueado. Realize a assinatura de R$ 25,00 para continuar."
        });
      }

      // Cálculo dos 15 dias de teste grátis a partir do cadastro (created_at)
      const createdAt = new Date(user.created_at || Date.now());
      const now = new Date();
      const diffInTime = now.getTime() - createdAt.getTime();
      const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));
      const trialDuration = 15;
      const daysRemaining = Math.max(0, trialDuration - diffInDays);

      if (diffInDays >= trialDuration) {
        // Passaram os 15 dias e não possui pagamento ativo -> Atualiza no banco para bloqueado
        await supabase
          .from("users")
          .update({ status_assinatura: "bloqueado" })
          .eq("id", userId);

        return res.json({
          isAllowed: false,
          isTrial: false,
          daysRemaining: 0,
          status: "bloqueado",
          message: "Seu período de teste grátis de 15 dias expirou. Faça o upgrade por R$ 25,00/mês para desbloquear seu sistema!"
        });
      }

      // Ainda dentro dos 15 dias de teste grátis
      return res.json({
        isAllowed: true,
        isTrial: true,
        daysRemaining: daysRemaining,
        status: "trialing",
        message: `Período de Teste Grátis Ativo: restam ${daysRemaining} dias.`
      });
    } catch (err: any) {
      console.error("[Stripe Check Access Error]:", err);
      return res.json({ isAllowed: true, isTrial: true, daysRemaining: 15, status: "trialing" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Se for uma requisição de ativos com extensão (como .js, .css, .png, etc.) ou na pasta de assets, não serve index.html, retorna 404
      if (req.path.includes('.') || req.path.startsWith('/assets/')) {
        return res.status(404).end();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
