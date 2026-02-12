import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
  timestamp: string;
  actions?: { label: string; value: string }[];
}

const HOURS = Array.from({ length: 10 }, (_, i) => {
  const h = i + 8; // 08:00 - 17:00
  return [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`];
}).flat();

const Chat = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const location = useLocation();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Olá! Eu sou a Tri 🐱 Como posso te ajudar hoje?",
      sender: "tri",
      timestamp: format(new Date(), "HH:mm:ss")
    },
  ]);
  const [input, setInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [pendingIsoDate, setPendingIsoDate] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [sending, setSending] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [lastReminderLevel, setLastReminderLevel] = useState(0); // 0: nenhum, 1: 15min, 2: 30min


  useEffect(() => {
    if (location.state) {
      const { webhookResponse, isInitiallyBlocked } = location.state;

      // Configura bloqueio inicial se vier do login
      if (isInitiallyBlocked) {
        setIsBlocked(true);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 2,
            text: "Humm... parece que você está bloqueado. Não se preocupe, basta clicar no botão abaixo para se desbloquear.",
            sender: "tri",
            timestamp: format(new Date(), "HH:mm:ss")
          },
        ]);
      } else if (webhookResponse && typeof webhookResponse === 'object' && webhookResponse.bloqueado === true) {
        // Fallback caso venha pelo payload do webhook
        setIsBlocked(true);
      }

      if (webhookResponse) {
        const responseText = typeof webhookResponse === 'string'
          ? webhookResponse
          : JSON.stringify(webhookResponse, null, 2);

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            text: responseText,
            sender: "tri",
            timestamp: format(new Date(), "HH:mm:ss")
          },
        ]);
      }

      // Limpa o estado para evitar repetição ao dar refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Automação de Lembretes de Inatividade
  useEffect(() => {
    if (!user?.id) return;

    const checkInactivity = async () => {
      try {
        const { data, error } = await (supabase
          .from("usuarios")
          .select("ultima_interacao, lembretes_enviados")
          .eq("id", user.id)
          .single() as any);

        if (error || !data || !data.ultima_interacao) return;

        const lastInteraction = new Date(data.ultima_interacao).getTime();
        const now = new Date().getTime();
        const diffMs = now - lastInteraction;
        const lembretes = data.lembretes_enviados || 0;

        // Lógica de 15 minutos (900.000 ms)
        if (diffMs >= 900000 && diffMs < 1800000 && lembretes === 0 && lastReminderLevel < 1) {
          setLastReminderLevel(1);
          const msg = "Oi! Vi que você ficou um tempinho sem responder 😊 Estou aqui quando quiser continuar!";
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: msg,
            sender: "tri",
            timestamp: format(new Date(), "HH:mm:ss")
          }]);

          await (supabase
            .from("usuarios")
            .update({ lembretes_enviados: 1 } as any)
            .eq("id", user.id) as any);
        }

        // Lógica de 30 minutos (1.800.000 ms)
        if (diffMs >= 1800000 && (lembretes === 1 || (lembretes === 0 && lastReminderLevel === 1)) && lastReminderLevel < 2) {
          setLastReminderLevel(2);
          const msg = "Só passando pra lembrar que continuo por aqui 💬 Quando quiser é só chamar!";
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: msg,
            sender: "tri",
            timestamp: format(new Date(), "HH:mm:ss")
          }]);

          await (supabase
            .from("usuarios")
            .update({ lembretes_enviados: 2 } as any)
            .eq("id", user.id) as any);
        }

      } catch (err) {
        console.error("Erro na cron de inatividade:", err);
      }
    };

    const interval = setInterval(checkInactivity, 60000); // Roda a cada 1 minuto
    return () => clearInterval(interval);
  }, [user?.id, lastReminderLevel]);

  const sendChatToWebhook = async (message: string) => {
    try {
      // Busca o status de bloqueio atualizado do Supabase
      const { data: userData } = await (supabase
        .from("usuarios")
        .select("bloqueado")
        .eq("id", user?.id)
        .single() as any);

      const currentBlockedStatus = userData?.bloqueado || false;

      // Atualiza o estado local para refletir o Supabase
      if (currentBlockedStatus !== isBlocked) {
        setIsBlocked(currentBlockedStatus);
      }

      const response = await fetch(
        "https://n8n-production-dabf.up.railway.app/webhook/chat-trilingo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user?.id || "",
            nome: user?.nome || "",
            email: user?.email || "",
            bloqueado: currentBlockedStatus,
            message,
          }),
        }
      );
      if (!response.ok) throw new Error("Erro ao enviar");

      const text = await response.text();
      try {
        const data = JSON.parse(text);

        // Check if user is blocked
        if (data && typeof data === 'object' && data.bloqueado === true) {
          setIsBlocked(true);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 2,
              text: "Ops! Notei que sua conta está bloqueada no momento. 😿 Mas não se preocupe, podemos resolver isso agora mesmo!",
              sender: "tri",
              timestamp: format(new Date(), "HH:mm:ss")
            },
          ]);
        } else if (data && typeof data === 'object' && data.bloqueado === false) {
          setIsBlocked(false);
        }

        return JSON.stringify(data, null, 2);
      } catch {
        return text;
      }
    } catch (error) {
      console.error("Erro no webhook:", error);
      return "Erro ao processar resposta do servidor. Verifique o console.";
    }
  };

  const resetReminders = async () => {
    if (!user?.id) return;
    setLastReminderLevel(0); // Reset local state too
    try {
      await (supabase
        .from("usuarios")
        .update({ lembretes_enviados: 0 } as any)
        .eq("id", user.id) as any);
    } catch (error) {
      console.error("Erro ao resetar lembretes:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Reset reminders on user interaction
    resetReminders();

    const userMsg: Message = {
      id: Date.now(),
      text: input,
      sender: "user",
      timestamp: format(new Date(), "HH:mm:ss")
    };
    setMessages((prev) => [...prev, userMsg]);
    const msgText = input;
    setInput("");
    setSending(true);

    const reply = await sendChatToWebhook(msgText);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        text: reply,
        sender: "tri",
        timestamp: format(new Date(), "HH:mm:ss")
      },
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
      timestamp: format(new Date(), "HH:mm:ss")
    };

    const triMsg: Message = {
      id: Date.now() + 1,
      text: `Você quer agendar para **${fullLabel}**. Está correto?`,
      sender: "tri",
      timestamp: format(new Date(), "HH:mm:ss"),
      actions: [
        { label: "Sim ✅", value: "yes" },
        { label: "Não, alterar ❌", value: "no" },
      ],
    };

    // Reset reminders on user interaction
    resetReminders();

    setMessages((prev) => [...prev, userMsg, triMsg]);
  };

  const fetchCurrentStatus = async () => {
    if (!user?.id) return "";
    const { data } = await (supabase
      .from("agendamentos")
      .select("status")
      .eq("usuario_id", user.id)
      .order("data_agendada", { ascending: false })
      .limit(1)
      .single() as any);
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

    const userMsg: Message = {
      id: Date.now(),
      text: label,
      sender: "user",
      timestamp: format(new Date(), "HH:mm:ss")
    };

    // Reset reminders on user interaction
    resetReminders();

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const msg = await sendToWebhook(action);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: msg,
          sender: "tri",
          timestamp: format(new Date(), "HH:mm:ss")
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "Ops, houve um erro. Tente novamente mais tarde 😿",
          sender: "tri",
          timestamp: format(new Date(), "HH:mm:ss")
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmAction = async (value: string) => {
    if (value === "no") {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Não, quero alterar a data.",
          sender: "user",
          timestamp: format(new Date(), "HH:mm:ss")
        },
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
      {
        id: Date.now(),
        text: "Sim, confirmar!",
        sender: "user",
        timestamp: format(new Date(), "HH:mm:ss")
      },
    ]);

    // Reset reminders on user interaction
    resetReminders();

    setAwaitingConfirmation(false);
    setSending(true);

    try {
      const msg = await sendToWebhook("agendar_conversa", pendingIsoDate);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: msg,
          sender: "tri",
          timestamp: format(new Date(), "HH:mm:ss")
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "Ops, houve um erro ao confirmar o agendamento. Tente novamente mais tarde 😿",
          sender: "tri",
          timestamp: format(new Date(), "HH:mm:ss")
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

  const handleUnblock = async () => {
    setSending(true);
    try {
      const response = await fetch("https://n8n-production-dabf.up.railway.app/webhook/desbloqueio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user?.id || "",
          nome: user?.nome || "",
          email: user?.email || "",
          bloqueado: isBlocked,
        }),
      });

      toast({ title: "Solicitação enviada!", description: "Sua solicitação de desbloqueio foi enviada com sucesso." });

      setIsBlocked(false);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Pronto! Enviei sua solicitação de desbloqueio. Em breve você poderá voltar a conversar comigo! 😸",
          sender: "tri",
          timestamp: format(new Date(), "HH:mm:ss")
        },
      ]);
    } catch (error) {
      console.error("Erro no desbloqueio:", error);
      toast({ title: "Erro", description: "Não foi possível enviar a solicitação. Tente novamente.", variant: "destructive" });
    } finally {
      setSending(false);
    }
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
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.sender === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary text-secondary-foreground rounded-bl-md"
                  }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 px-1">
                {msg.timestamp}
              </span>
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
              digitando...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-3">
        {isBlocked && (
          <div className="mb-3">
            <Button
              onClick={handleUnblock}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2"
              disabled={sending}
            >
              <XCircle className="h-5 w-5" />
              Desbloquear
            </Button>
          </div>
        )}
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
            placeholder={isBlocked ? "Sua conta está bloqueada..." : "Digite sua mensagem..."}
            className="flex-1 rounded-full"
            disabled={isBlocked || sending}
          />
          <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={isBlocked || sending}>
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
