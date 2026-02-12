import { useState, useRef, useEffect } from "react";
import { Send, CalendarPlus, XCircle, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import triAvatar from "@/assets/favicon.png";
import userAvatar from "@/assets/user_avatar.png";

interface Message {
  id: number;
  text: string;
  sender: "user" | "tri";
  actions?: { label: string; value: string }[];
}

const HOURS = Array.from({ length: 10 }, (_, i) => {
  const h = i + 8; // 08:00 - 17:00
  return [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`];
}).flat();

const Chat = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Olá! Eu sou a Tri 🐱 Como posso te ajudar hoje?", sender: "tri" },
  ]);
  const [input, setInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [pendingIsoDate, setPendingIsoDate] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendChatToWebhook = async (message: string) => {
    try {
      const response = await fetch(
        "https://n8n-production-dabf.up.railway.app/webhook/chat-trilingo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user?.id || "",
            nome: user?.nome || "",
            email: user?.email || "",
            bloqueado: false,
            message,
          }),
        }
      );
      if (!response.ok) throw new Error("Erro ao enviar");
      const data = await response.json();
      return data.mensagem || data.message || "Estou aqui para ajudar! Em breve terei inteligência para conversar de verdade 😸";
    } catch {
      return "Estou aqui para ajudar! Em breve terei inteligência para conversar de verdade 😸";
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now(), text: input, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    const msgText = input;
    setInput("");
    setSending(true);

    const reply = await sendChatToWebhook(msgText);
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, text: reply, sender: "tri" },
    ]);
    setSending(false);
  };

  const handleScheduleConfirm = () => {
    if (!selectedDate || !selectedTime) {
      toast({ title: "Selecione uma data e horário", variant: "destructive" });
      return;
    }

    const dateStr = format(selectedDate, "dd/MM/yyyy", { locale: ptBR });
    const fullLabel = `${dateStr} às ${selectedTime}`;
    const isoDate = format(selectedDate, "yyyy-MM-dd") + `T${selectedTime}:00`;

    setModalOpen(false);
    setPendingDate(fullLabel);
    setPendingIsoDate(isoDate);
    setAwaitingConfirmation(true);

    const userMsg: Message = {
      id: Date.now(),
      text: `Quero agendar para ${fullLabel}`,
      sender: "user",
    };

    const triMsg: Message = {
      id: Date.now() + 1,
      text: `Você quer agendar para **${fullLabel}**. Está correto?`,
      sender: "tri",
      actions: [
        { label: "Sim ✅", value: "yes" },
        { label: "Não, alterar ❌", value: "no" },
      ],
    };

    setMessages((prev) => [...prev, userMsg, triMsg]);
  };

  const fetchCurrentStatus = async () => {
    if (!user?.id) return "";
    const { data } = await supabase
      .from("agendamentos")
      .select("status")
      .eq("usuario_id", user.id)
      .order("data_agendada", { ascending: false })
      .limit(1)
      .single();
    return data?.status || "";
  };

  const sendToWebhook = async (button: string, data_agendada?: string | null) => {
    const currentStatus = await fetchCurrentStatus();
    const response = await fetch(
      "https://n8n-production-dabf.up.railway.app/webhook/api/v1/agendamento",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user?.id || "",
          nome: user?.nome || "",
          email: user?.email || "",
          data_agendada: data_agendada || "",
          status: currentStatus,
          button,
        }),
      }
    );
    if (!response.ok) throw new Error("Erro ao enviar");
    const data = await response.json();
    return data.mensagem || data.message || "Operação realizada com sucesso!";
  };

  const handleActionButton = async (action: string, label: string) => {
    if (sending) return;

    const userMsg: Message = { id: Date.now(), text: label, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const msg = await sendToWebhook(action);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: msg, sender: "tri" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: "Ops, houve um erro. Tente novamente mais tarde 😿", sender: "tri" },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmAction = async (value: string) => {
    if (value === "no") {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), text: "Não, quero alterar a data.", sender: "user" },
      ]);
      setAwaitingConfirmation(false);
      setPendingDate(null);
      setPendingIsoDate(null);
      setSelectedDate(undefined);
      setSelectedTime("");
      setModalOpen(true);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), text: "Sim, confirmar!", sender: "user" },
    ]);
    setAwaitingConfirmation(false);
    setSending(true);

    try {
      const msg = await sendToWebhook("agendar_conversa", pendingIsoDate);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: msg, sender: "tri" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "Ops, houve um erro ao confirmar o agendamento. Tente novamente mais tarde 😿",
          sender: "tri",
        },
      ]);
    } finally {
      setSending(false);
      setPendingDate(null);
      setPendingIsoDate(null);
    }
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <Avatar className="h-9 w-9">
          <AvatarImage src={triAvatar} alt="Tri" />
        </Avatar>
        <h1 className="text-lg font-bold text-foreground">Tri</h1>
      </header>

      {/* Action Buttons */}
      <div className="px-4 py-3 border-b border-border bg-card">
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              if (awaitingConfirmation || sending) return;
              setSelectedDate(undefined);
              setSelectedTime("");
              setModalOpen(true);
            }}
            className="gap-2 col-span-2"
            disabled={awaitingConfirmation || sending}
          >
            <CalendarPlus className="h-4 w-4" />
            Agendar Conversa
          </Button>
          <Button
            onClick={() => handleActionButton("consultar", "Quero consultar meu agendamento")}
            variant="outline"
            className="gap-2"
            disabled={awaitingConfirmation || sending}
          >
            <Search className="h-4 w-4" />
            Consultar
          </Button>
          <Button
            onClick={() => handleActionButton("atualizar", "Quero atualizar meu agendamento")}
            variant="outline"
            className="gap-2"
            disabled={awaitingConfirmation || sending}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button
            onClick={() => handleActionButton("cancelar", "Quero cancelar meu agendamento")}
            variant="outline"
            className="gap-2 col-span-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            disabled={awaitingConfirmation || sending}
          >
            <XCircle className="h-4 w-4" />
            Cancelar Agendamento
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={`flex items-end gap-2 ${msg.sender === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage
                  src={msg.sender === "tri" ? triAvatar : userAvatar}
                  alt={msg.sender === "tri" ? "Tri" : "Você"}
                />
              </Avatar>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary text-secondary-foreground rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
            {msg.actions && (
              <div className="flex gap-2 ml-10 mt-2">
                {msg.actions.map((action) => (
                  <Button
                    key={action.value}
                    size="sm"
                    variant={action.value === "yes" ? "default" : "outline"}
                    onClick={() => handleConfirmAction(action.value)}
                    disabled={!awaitingConfirmation || sending}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex items-end gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={triAvatar} alt="Tri" />
            </Avatar>
            <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5 text-sm animate-pulse">
              Enviando agendamento...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 rounded-full"
          />
          <Button type="submit" size="icon" className="rounded-full shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Schedule Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar Conversa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={isDateDisabled}
              className={cn("p-3 pointer-events-auto")}
              locale={ptBR}
            />
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o horário" />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleScheduleConfirm} className="w-full" disabled={!selectedDate || !selectedTime}>
              Confirmar data e horário
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;
