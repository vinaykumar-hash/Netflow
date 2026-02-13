from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import requests
import json

class PacketUpdateView(APIView):
    def post(self, request):
        channel_layer = get_channel_layer()
        data = request.data
        
        # Pathway might send a single object or a list
        updates = data if isinstance(data, list) else [data]
        
        for update in updates:
            async_to_sync(channel_layer.group_send)(
                "packets",
                {
                    "type": "send_packet_update",
                    "data": update
                }
            )
        return Response({"status": f"broadcasted {len(updates)} updates"}, status=status.HTTP_200_OK)

class ChatProxyView(APIView):
    def post(self, request):
        query = request.data.get("messages")
        if not query:
            return Response({"error": "No query provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Forward query to Pathway's REST connector
            response = requests.post(
                "http://localhost:8011",
                json={"messages": query},
                timeout=30
            )
            return Response(response.json(), status=response.status_code)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
