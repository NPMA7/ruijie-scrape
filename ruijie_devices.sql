CREATE TABLE public.ruijie_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sn TEXT UNIQUE NOT NULL,
    mac_address TEXT,
    alias TEXT,
    ip_address TEXT,
    status TEXT,
    connection_type TEXT,
    clients INTEGER DEFAULT 0,
    last_online TEXT,
    last_offline TEXT,
    last_log_history TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

