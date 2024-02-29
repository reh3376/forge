#!/bin/bash
# init/register-connectors.sh

# Wait for Kafka Connect to be ready
echo "Waiting for Kafka Connect to start listening on kafka-connect:8083 ⏳"
while : ; do
    curl -s http://kafka-connect:8083/connectors > /dev/null
    if [ $? -eq 0 ]; then
        break
    fi
    echo -e $(date) " Kafka Connect listener HTTP state: " $?
    sleep 5
done

# Register the connector
echo "Registering Debezium PostgreSQL connector ⏳"
curl -i -X POST -H "Accept:application/json" -H "Content-Type:application/json" \
    http://localhost:8083/connectors/ -d '{
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "database.dbname": "recipe-configuration",
      "database.history.kafka.bootstrap.servers": "localhost:9092",
      "database.history.kafka.topic": "schema-changes.movies",
      "database.hostname": "localhost",
      "database.password": "admin",
      "database.port": "5432",
      "database.server.name": "postgres",
      "database.user": "admin",
      "name": "movies-db-connector",
      "plugin.name": "pgoutput",
      "table.include.list": "public.Procedure",
      "tasks.max": "1",
      "topic.creation.default.cleanup.policy": "delete",
      "topic.creation.default.partitions": "1",
      "topic.creation.default.replication.factor": "1",
      "topic.creation.default.retention.ms": "604800000",
      "topic.creation.enable": "true",
      "topic.prefix": "postgres"
    },
    "name": "movies-db-connector",
    "tasks": [],
    "type": "source"
  }'

echo -e "\nRegistered Debezium PostgreSQL connector"