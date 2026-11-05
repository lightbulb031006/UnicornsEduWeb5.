#!/bin/sh
# Chạy một lần khi volume Postgres còn trống (docker-entrypoint-initdb.d).
# Mỗi instance: role đăng nhập riêng + database riêng do role đó sở hữu.
# Role của instance này không CONNECT được database của instance khác.
set -eu

create_instance_db() {
  id="$1"
  password="$2"
  db="uniedu_${id}"

  psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
    -v db="${db}" -v pw="${password}" <<'SQL'
CREATE ROLE :"db" LOGIN PASSWORD :'pw';
CREATE DATABASE :"db" OWNER :"db";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
SQL

  # Giống layout Supabase: extension nằm ở schema `extensions` (một số default cột
  # tham chiếu `extensions.uuid_generate_v4()`), search_path có `extensions`.
  psql -v ON_ERROR_STOP=1 --username postgres --dbname "${db}" -v db="${db}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER DATABASE :"db" SET search_path = "$user", public, extensions;
SQL
}

create_instance_db it "${IT_DB_PASSWORD:?}"
create_instance_db eng "${ENG_DB_PASSWORD:?}"
create_instance_db jp "${JP_DB_PASSWORD:?}"
