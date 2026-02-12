-- Enable RLS on usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read usuarios (for login check)
CREATE POLICY "Allow public read usuarios" ON public.usuarios FOR SELECT USING (true);

-- Allow anyone to insert usuarios (for registration)
CREATE POLICY "Allow public insert usuarios" ON public.usuarios FOR INSERT WITH CHECK (true);

-- Enable RLS on agendamentos
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Allow public access to agendamentos for now
CREATE POLICY "Allow public read agendamentos" ON public.agendamentos FOR SELECT USING (true);
CREATE POLICY "Allow public insert agendamentos" ON public.agendamentos FOR INSERT WITH CHECK (true);