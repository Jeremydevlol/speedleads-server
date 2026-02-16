#!/bin/bash

# debug-ecs-failure.sh
# Script para diagnosticar fallos en ECS

echo "🔍 Diagnosticando fallo de ECS..."

# Información del servicio
SERVICE_NAME="uniclick-be-api-eu-west-1"
CLUSTER_NAME="uniclick-cluster"
REGION="eu-west-1"

echo "📊 Información del servicio:"
echo "   Servicio: $SERVICE_NAME"
echo "   Cluster: $CLUSTER_NAME"
echo "   Región: $REGION"

# Obtener las tareas del servicio
echo ""
echo "🔍 Obteniendo tareas activas..."
aws ecs list-tasks \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --region $REGION

# Describir las tareas para ver el estado
echo ""
echo "🔍 Estado de las tareas..."
TASK_ARNS=$(aws ecs list-tasks \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --region $REGION \
    --query 'taskArns[0]' \
    --output text)

if [ "$TASK_ARNS" != "None" ] && [ "$TASK_ARNS" != "" ]; then
    echo "📋 Describiendo tarea: $TASK_ARNS"
    aws ecs describe-tasks \
        --cluster $CLUSTER_NAME \
        --tasks $TASK_ARNS \
        --region $REGION \
        --query 'tasks[0].{TaskArn:taskArn,LastStatus:lastStatus,DesiredStatus:desiredStatus,HealthStatus:healthStatus,StoppedReason:stoppedReason,Containers:containers[0].{Name:name,LastStatus:lastStatus,ExitCode:exitCode,Reason:reason}}'
else
    echo "❌ No se encontraron tareas activas"
fi

# Obtener logs de CloudWatch
echo ""
echo "📝 Intentando obtener logs de CloudWatch..."
LOG_GROUP="/ecs/uniclick-be-api-task-definition"

echo "🔍 Streams de logs disponibles:"
aws logs describe-log-streams \
    --log-group-name $LOG_GROUP \
    --region $REGION \
    --order-by LastEventTime \
    --descending \
    --max-items 3 \
    --query 'logStreams[*].{StreamName:logStreamName,LastEventTime:lastEventTime}'

# Obtener los últimos logs
LATEST_STREAM=$(aws logs describe-log-streams \
    --log-group-name $LOG_GROUP \
    --region $REGION \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --query 'logStreams[0].logStreamName' \
    --output text)

if [ "$LATEST_STREAM" != "None" ] && [ "$LATEST_STREAM" != "" ]; then
    echo ""
    echo "📝 Últimos logs del contenedor:"
    echo "   Stream: $LATEST_STREAM"
    aws logs get-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name $LATEST_STREAM \
        --region $REGION \
        --start-from-head \
        --query 'events[*].message' \
        --output text | tail -20
else
    echo "❌ No se encontraron streams de logs"
fi

# Verificar el Target Group Health
echo ""
echo "🔍 Estado del Target Group..."
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:eu-west-1:880780901703:targetgroup/uniclick-be-api-tg/917eef3b978d50c8"

aws elbv2 describe-target-health \
    --target-group-arn $TARGET_GROUP_ARN \
    --region $REGION \
    --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,Health:TargetHealth.State,Reason:TargetHealth.Reason,Description:TargetHealth.Description}'

echo ""
echo "🎯 Posibles causas del fallo:"
echo "   1. Contenedor no arranca (check logs)"
echo "   2. Health check falla (check /health endpoint)"
echo "   3. Puerto incorrecto (should be 5001)"
echo "   4. Timeout en el arranque"
echo "   5. Variables de entorno faltantes"
echo ""
echo "💡 Siguiente paso: revisar los logs arriba para ver el error específico"
