CC ?= gcc
CFLAGS = -std=c11 -fPIC -O2 -Wall -Wno-unused-function -shared
LDFLAGS = -ldl -lGL -lX11
TARGET = libember_gl_hook.so
PREFIX ?= $(HOME)/.local/share/ember

.PHONY: all install clean

all: $(TARGET)

$(TARGET): glhook.c
	$(CC) $(CFLAGS) -o $(TARGET) glhook.c $(LDFLAGS)

install: all
	mkdir -p $(PREFIX)
	cp $(TARGET) $(PREFIX)/

clean:
	rm -f $(TARGET)
