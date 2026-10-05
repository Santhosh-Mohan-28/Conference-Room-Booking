#!/bin/sh
set -e

mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql

if [ ! -d "/run/shm/pgdata" ] || [ ! -f "/run/shm/pgdata/PG_VERSION" ]; then
  echo "Initializing new PG data directory in /run/shm/pgdata..."
  mkdir -p /run/shm/pgdata
  chown -R postgres:postgres /run/shm/pgdata
  su - postgres -c "/usr/bin/initdb -D /run/shm/pgdata -A trust"
  echo "listen_addresses = '*'" >> /run/shm/pgdata/postgresql.conf
  echo "host all all 0.0.0.0/0 trust" >> /run/shm/pgdata/pg_hba.conf
  echo "host all all ::0/0 trust" >> /run/shm/pgdata/pg_hba.conf
fi

echo "Starting PostgreSQL..."
su - postgres -c "/usr/bin/pg_ctl -D /run/shm/pgdata -l /run/shm/pgdata/logfile -w start"

echo "Ensuring database exists and extensions enabled..."
su - postgres -c "/usr/bin/psql -c 'CREATE DATABASE postgres;' || true"
su - postgres -c "/usr/bin/psql -d postgres -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'"

echo "PostgreSQL is ready and accepting connections."
