-- Allow employees to update their own invitation_accepted status
CREATE POLICY "Employees can update their own invitation status"
ON public.employees
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);