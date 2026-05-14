-- Allow employees to view their own anotacoes (work entries)
CREATE POLICY "Employees can view their own anotacoes"
ON public.anotacoes_folguista
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = anotacoes_folguista.folguista_id
    AND employees.user_id = auth.uid()
  )
);