"""Django settings for the RouteWise API.

Every secret and deployment value comes from the environment (or `backend/.env` locally).
The API stores nothing: SQLite exists only because Django expects a database, and the
in-memory cache is a best-effort speed-up (see docs/adr/0003-stateless-api.md).
"""

import os
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173"]),
    CORS_ALLOWED_ORIGIN_REGEXES=(list, []),
    NUM_PROXIES=(int, 0),
)
if (BASE_DIR / ".env").exists():
    environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY", default="dev-only-insecure-key")
ON_RENDER = "RENDER" in os.environ
if ON_RENDER and SECRET_KEY.startswith("dev-only"):
    raise ImproperlyConfigured("Set SECRET_KEY in the Render environment.")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")
if render_host := os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(render_host)

TOMTOM_API_KEY = env("TOMTOM_API_KEY", default="")
GEOAPIFY_API_KEY = env("GEOAPIFY_API_KEY", default="")

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "TIMEOUT": 3600,
        # Weather cells are ~5 KB each; this cap keeps the cache well inside Render's 512 MB.
        "OPTIONS": {"MAX_ENTRIES": 5000},
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Render terminates TLS in front of Django.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOWED_ORIGIN_REGEXES = env("CORS_ALLOWED_ORIGIN_REGEXES")
CORS_EXPOSE_HEADERS = ["Server-Timing"]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    # No accounts: requests are anonymous, and no auth models are installed.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {"plan": "60/hour", "heatmap": "60/hour", "places": "600/hour"},
    # Behind Render's proxy the client IP is the last X-Forwarded-For entry.
    "NUM_PROXIES": env("NUM_PROXIES"),
    "EXCEPTION_HANDLER": "trips.api.errors.exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "RouteWise API",
    "DESCRIPTION": (
        "Compares three truck routes by the weather each meets at the hour the truck gets "
        "there, scored with Spotter's risk and load rules. Coordinates are [lon, lat]; "
        "times are UTC."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"trips": {"handlers": ["console"], "level": "INFO"}},
}
