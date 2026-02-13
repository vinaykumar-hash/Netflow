from django.urls import path
from .views import PacketUpdateView, ChatProxyView

urlpatterns = [
    path('update/', PacketUpdateView.as_view(), name='packet-update'),
    path('chat/', ChatProxyView.as_view(), name='chat-proxy'),
]
