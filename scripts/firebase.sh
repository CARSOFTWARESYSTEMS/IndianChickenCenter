#!/bin/sh
# Runs the project's firebase-tools. Its emulators need Java 21 or newer; on a Mac whose default Java is older,
# this picks the newest installed JDK that is 21+.
if [ -x /usr/libexec/java_home ]; then
  JDK=$(/usr/libexec/java_home -v 21+ 2>/dev/null) && export JAVA_HOME="$JDK" && export PATH="$JDK/bin:$PATH"
fi
exec npx --no-install firebase "$@"
