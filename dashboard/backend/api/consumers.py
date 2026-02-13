import json
from channels.generic.websocket import AsyncWebsocketConsumer

class PacketConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("packets", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("packets", self.channel_name)

    async def send_packet_update(self, event):
        await self.send(text_data=json.dumps(event["data"]))
