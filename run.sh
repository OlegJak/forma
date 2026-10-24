#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -z "${JAVA_HOME:-}" ]; then JAVA_HOME="$(find "$PWD/.runtime" -type d -path '*/Contents/Home' | head -n 1)"; export JAVA_HOME; fi
if [ -d .runtime/apache-maven-3.9.11 ]; then MAVEN="$PWD/.runtime/apache-maven-3.9.11/bin/mvn"; else MAVEN=mvn; fi
"$MAVEN" -q -DskipTests package
exec "$JAVA_HOME/bin/java" -jar target/forma-1.0.0.jar
