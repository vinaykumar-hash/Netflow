from django.urls import path
from .views import PacketUpdateView, ChatProxyView, NetworkDevicesView, SpoofStartView, SpoofStopView, WhitelistSettingsView

urlpatterns = [
    path('update/', PacketUpdateView.as_view(), name='packet-update'),
    path('chat/', ChatProxyView.as_view(), name='chat-proxy'),
    path('network/devices/', NetworkDevicesView.as_view(), name='network-devices'),
    path('network/spoof/start/', SpoofStartView.as_view(), name='spoof-start'),
    path('network/spoof/stop/', SpoofStopView.as_view(), name='spoof-stop'),
    path('settings/whitelist/', WhitelistSettingsView.as_view(), name='settings-whitelist'),
]
