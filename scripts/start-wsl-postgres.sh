#!/bin/sh
set -e

PGDATA=/run/shm/pgdata
PGPORT=5433

mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql 2>/dev/null || true

if [ ! -d "$PGDATA" ] || [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "Initializing PostgreSQL data directory..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su - postgres -c "/usr/bin/initdb -D $PGDATA -A trust --encoding=UTF8"
  echo "port = $PGPORT" >> "$PGDATA/postgresql.conf"
  echo "listen_addresses = '0.0.0.0'" >> "$PGDATA/postgresql.conf"
  echo "host all all 0.0.0.0/0 trust" >> "$PGDATA/pg_hba.conf"
  echo "host all all ::0/0 trust" >> "$PGDATA/pg_hba.conf"
else
  echo "Data directory already exists."
fi

# Check if already running
if su - postgres -c "/usr/bin/pg_ctl -D $PGDATA status" 2>/dev/null | grep -q "running"; then
  echo "PostgreSQL already running on port $PGPORT."
else
  echo "Starting PostgreSQL on port $PGPORT..."
  su - postgres -c "/usr/bin/pg_ctl -D $PGDATA -l $PGDATA/logfile -w start"
fi

echo "Ensuring database and extensions..."
su - postgres -c "/usr/bin/psql -p $PGPORT -c 'CREATE DATABASE postgres;'" 2>/dev/null || true
su - postgres -c "/usr/bin/psql -p $PGPORT -d postgres -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'" 2>/dev/null || true

su - postgres -c "/usr/bin/pg_isready -h 0.0.0.0 -p $PGPORT"
echo "READY on port $PGPORT"
