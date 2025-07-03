# mysite/asgi.py

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator # <-- ADD THIS IMPORT

import mysite.routing


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator( # <-- ADD THIS WRAPPER
        AuthMiddlewareStack(
            URLRouter(mysite.routing.websocket_urlpatterns)
        )
    ),
})
