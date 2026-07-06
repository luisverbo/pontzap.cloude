import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteEmployeeRequest {
  email: string;
  name: string;
  phone?: string;
  password: string;
  type: "fixed" | "substitute";
  locationIds?: string[];
  primaryLocationId?: string;
  // Usado quando o solicitante é MASTER (modo suporte) para criar na empresa correta.
  companyId?: string;
  // Dados legais (Portaria 671)
  cpf?: string;
  pis?: string;
  admissionDate?: string;
  position?: string;
  department?: string;
  valorDiaria?: number | null;
}

// Empresa interna usada para contas MASTER quando não estiverem em Modo Suporte.
// Mantém o comportamento esperado do produto: o MASTER consegue operar “na própria empresa”.
const PONTZAP_MASTER_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      throw new Error("Invalid authorization token");
    }

    // Parse body once (não chamar req.json() duas vezes)
    const {
      email,
      name,
      phone,
      password,
      type,
      locationIds,
      primaryLocationId,
      companyId,
      cpf,
      pis,
      admissionDate,
      position,
      department,
      valorDiaria,
    }: InviteEmployeeRequest = await req.json();

    // Verificar se é MASTER
    const { data: masterData, error: masterError } = await supabaseAdmin
      .from("master_users")
      .select("id")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (masterError) {
      console.error("Error checking master user:", masterError);
    }

    const isMaster = !!masterData;

    // Check if requesting user is admin (exceto master)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .maybeSingle();

    if (!isMaster && (roleError || roleData?.role !== "admin")) {
      throw new Error("Only admins can invite employees");
    }

    // Resolve company_id
    let resolvedCompanyId: string | null | undefined = null;

    if (isMaster) {
      // Se estiver em Modo Suporte, usa a empresa selecionada.
      // Caso contrário, cria na empresa “PontZap Master” (empresa interna do sistema).
      resolvedCompanyId = companyId ?? PONTZAP_MASTER_COMPANY_ID;

      if (!companyId) {
        console.log(
          `MASTER criando funcionário sem Modo Suporte; usando empresa padrão: ${resolvedCompanyId}`
        );
      }

      // Valida se a empresa existe
      const { data: companyData, error: companyError } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("id", resolvedCompanyId)
        .maybeSingle();

      if (companyError || !companyData) {
        console.error("Invalid companyId provided by master:", companyError);
        throw new Error("Empresa inválida para criação de funcionário");
      }
    } else {
      // Get requesting user's company_id
      const { data: adminEmployee, error: adminEmpError } = await supabaseAdmin
        .from("employees")
        .select("company_id")
        .eq("user_id", requestingUser.id)
        .maybeSingle();

      if (adminEmpError) {
        console.error("Error fetching admin's company:", adminEmpError);
      }

      resolvedCompanyId = adminEmployee?.company_id;
      console.log(`Admin's company_id: ${resolvedCompanyId}`);

      if (!resolvedCompanyId) {
        throw new Error("Admin não está associado a nenhuma empresa");
      }
    }

    if (!email || !name || !password) {
      throw new Error("Email, name and password are required");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    console.log(`Processing employee: ${email} (${name})${phone ? ` with phone: ${phone}` : ''}`);

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    let userId: string;

    if (existingUser) {
      console.log(`User ${email} already exists with ID: ${existingUser.id}`);
      userId = existingUser.id;

      // Check if employee record already exists for this user
      const { data: existingEmployee, error: empCheckError } = await supabaseAdmin
        .from("employees")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (empCheckError) {
        console.error("Error checking existing employee:", empCheckError);
        throw new Error("Erro ao verificar funcionário existente");
      }

      if (existingEmployee) {
        throw new Error("Este funcionário já está cadastrado no sistema");
      }

      // Update the user's password and metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password,
        email_confirm: true,
        user_metadata: { name: name, phone: phone }
      });

      if (updateError) {
        console.error("Error updating user:", updateError);
        throw new Error(`Erro ao atualizar usuário: ${updateError.message}`);
      }

      // Update profile
      await supabaseAdmin
        .from("profiles")
        .update({ phone: phone, name: name })
        .eq("id", userId);
      
      console.log(`Updated existing user ${userId} with new password`);
    } else {
      // Create new user with password directly
      console.log(`Creating new user: ${email}`);

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          name: name,
          phone: phone,
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        throw new Error(`Erro ao criar usuário: ${createError.message}`);
      }

      userId = createData.user.id;
      console.log(`New user created with ID: ${userId}`);
    }

    // Create employee record with company_id
    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: userId,
        type: type || "fixed",
        is_active: true,
        invitation_accepted: true,
        company_id: resolvedCompanyId,
      })
      .select()
      .single();

    if (employeeError) {
      console.error("Error creating employee:", employeeError);
      throw new Error(`Erro ao criar funcionário: ${employeeError.message}`);
    }

    // Best-effort: store legal/compliance fields. Wrapped so a not-yet-applied
    // migration can never break employee creation.
    if (cpf || pis || admissionDate || position || department || valorDiaria != null) {
      try {
        await supabaseAdmin
          .from("employees")
          .update({
            cpf: cpf || null,
            pis: pis || null,
            admission_date: admissionDate || null,
            position: position || null,
            department: department || null,
            valor_diaria: valorDiaria ?? null,
          })
          .eq("id", employeeData.id);
      } catch (e) {
        console.error("Could not save legal fields (migration applied?):", e);
      }
    }

    console.log(`Employee record created: ${employeeData.id} with company_id: ${resolvedCompanyId}`);

    // Update phone in profile if provided
    if (phone) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: profileExists } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      
      if (profileExists) {
        await supabaseAdmin
          .from("profiles")
          .update({ phone: phone, name: name })
          .eq("id", userId);
        console.log(`Phone number ${phone} saved for user ${userId}`);
      }
    }

    // Assign locations if provided
    if (locationIds && locationIds.length > 0) {
      const locationAssignments = locationIds.map(locationId => ({
        employee_id: employeeData.id,
        location_id: locationId,
        is_primary: locationId === primaryLocationId,
      }));

      const { error: locationsError } = await supabaseAdmin
        .from("employee_locations")
        .insert(locationAssignments);

      if (locationsError) {
        console.error("Error assigning locations:", locationsError);
      } else {
        console.log(`Assigned ${locationIds.length} locations to employee`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Funcionário ${name} criado com sucesso! Email: ${email}`,
        employee: employeeData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in invite-employee function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});