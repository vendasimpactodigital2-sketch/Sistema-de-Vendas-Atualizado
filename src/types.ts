export interface DailyBusinessHours {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface BusinessHours {
  monday: DailyBusinessHours;
  tuesday: DailyBusinessHours;
  wednesday: DailyBusinessHours;
  thursday: DailyBusinessHours;
  friday: DailyBusinessHours;
  saturday: DailyBusinessHours;
  sunday: DailyBusinessHours;
}

export interface CompanyProfile {
  tradingName: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cnpjCpf: string;
  logo: string | null;
  pixKey?: string;
  goalsReminderEnabled?: boolean;
  goalsReminderTime?: string;
  openingTime?: string; // HH:MM format
  closingTime?: string; // HH:MM format
  autoCloseRegisterEnabled?: boolean;
  autoBackupDownloadEnabled?: boolean;
  businessHours?: BusinessHours;
}

export interface ProductSaleItem {
  id: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  unitCost?: number;
}

export interface CostItem {
  id: string;
  description: string;
  value: number;
}

export interface SalePayment {
  id: string;
  amount: number;
  date: string; // ISO string
  method: 'dinheiro' | 'cartão' | 'pix';
}

export interface Sale {
  id: string;
  clientName: string;
  clientPhone: string;
  items: ProductSaleItem[];
  useMotoboy: boolean;
  motoboyCost: number;
  discount: number;
  downPayment: number; // "sinal"
  operationCost: number; // "gasto dessa venda"
  costItems?: CostItem[]; // detalhamento de gastos mais preciso
  totalValue: number; // final total calculated automatically
  balanceDue: number; // remaining value to be paid (totalValue - downPayment)
  netProfit: number; // totalValue - operationCost
  clientImage: string | null; // base64 representation of pasted/uploaded image
  date: string;
  isBudget?: boolean;
  paymentMethod?: 'dinheiro' | 'cartão' | 'pix';
  orderDate?: string; // data do pedido
  deliveryDate?: string; // data de entrega
  deliveryReason?: string; // motivo de reagendamento / observação da entrega
  payments?: SalePayment[]; // precise payment history logs for cash flow
  materialEntregue?: boolean; // indica se o material já foi entregue/retirado pelo cliente
  deliveryStatus?: 'pendente' | 'entregue'; // status de entrega do pedido
}

export interface DashboardStats {
  totalSalesValue: number;
  totalRevenuePaid: number;
  totalPending: number;
  totalDiscount: number;
  totalMotoboy: number;
  totalOperationCost: number;
  totalNetProfit: number;
}

export interface Expense {
  id: string;
  description: string;
  value: number;
  date: string; // ISO string or YYYY-MM-DD
  category: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  owner_id?: string;
  role?: "motoboy" | "atendente" | "administrador" | string;
  created_at?: string;
  status_assinatura?: string;
  status?: string;
  is_admin?: boolean;
}

export interface CatalogProduct {
  id: string;
  description: string;
  costPrice: number;
  salePrice: number;
  profit: number; // salePrice - costPrice
  minStock: number;
  currentStock: number;
}

export const getSaleOrderDate = (sale: Sale): string => {
  if (sale.orderDate) return sale.orderDate;
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments[0].date;
  }
  return sale.date;
};

export const getSaleOperationCost = (sale: Sale): number => {
  if (sale.isBudget) return 0;
  if (sale.costItems && sale.costItems.length > 0) {
    return sale.costItems.reduce((sum, item) => sum + item.value, 0);
  }
  return sale.operationCost || 0;
};

export interface CustomReminder {
  id: string;
  title: string;
  type: "date" | "weekly";
  date?: string; // YYYY-MM-DD
  dayOfWeek?: number; // 0-6
  time: string; // HH:MM
  isAllDay?: boolean;
  completed?: boolean;
  notified?: boolean;
}

export interface CashRegisterSession {
  id: string;
  status: "aberto" | "fechado";
  valorAbertura: number;
  valorFechamentoEsperado?: number;
  valorFechamentoReal?: number;
  dataAbertura: string;
  dataFechamento?: string;
  operador: string;
  observacoes?: string;
  historicoVendas?: any[];
}

export interface CashRegisterState {
  currentSession: CashRegisterSession | null;
  history: CashRegisterSession[];
}

export interface SupportFeedback {
  id: string;
  user_id: string;
  user_name: string;
  audio_url: string;
  message?: string;
  resposta_admin?: string;
  respondido_em?: string;
  created_at: string;
}

export interface SupportConfig {
  id: string;
  horario_inicio: string;
  horario_fim: string;
  mensagem_fechado: string;
}



