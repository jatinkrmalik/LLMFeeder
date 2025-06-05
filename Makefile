
default:
	@echo "Call a specific subcommand:"
	@echo
	@$(MAKE) -pRrq -f $(lastword $(MAKEFILE_LIST)) : 2>/dev/null\
	| awk -v RS= -F: '/^# File/,/^# Finished Make data base/ {if ($$1 !~ "^[#.]") {print $$1}}'\
	| sort\
	| egrep -v -e '^[^[:alnum:]]' -e '^$@$$'
	@echo
	@exit 1

DIST_DIR = dist
BUILD_SCRIPT = ./scripts/build.sh

all: chrome firefox source

full-build:
	@$(BUILD_SCRIPT)

chrome:
	@$(BUILD_SCRIPT) chrome

firefox:
	@$(BUILD_SCRIPT) firefox

source:
	@$(BUILD_SCRIPT) source


versioned-full: check-version
	@$(BUILD_SCRIPT) --version $(version) all

versioned-chrome: check-version
	@$(BUILD_SCRIPT) --version $(version) chrome

versioned-firefox: check-version
	@$(BUILD_SCRIPT) --version $(version) firefox

versioned-source: check-version
	@$(BUILD_SCRIPT) --version $(version) source

check-version:
ifndef version
	$(error version is not defined. Usage: make versioned-<target> version=x.x.x)
endif

clean:
	rm -rf $(DIST_DIR)/*

help:
	@echo "Build Targets:"
	@echo "  all               - Build all packages (chrome, firefox, source)"
	@echo "  chrome            - Build Chrome package"
	@echo "  firefox           - Build Firefox package"
	@echo "  source            - Build source package"
	@echo "  full-build        - Build all packages (same as ./scripts/build.sh)"
	@echo ""
	@echo "Versioned Targets (require version parameter):"
	@echo "  versioned-full    - Build all packages with specified version"
	@echo "  versioned-chrome  - Build Chrome with specified version"
	@echo "  versioned-firefox - Build Firefox with specified version"
	@echo "  versioned-source  - Build source package with specified version"
	@echo ""
	@echo "Maintenance:"
	@echo "  clean             - Remove build artifacts"
	@echo "  help              - Show this help message"
	@echo ""
	@echo "Usage examples:"
	@echo "  make versioned-chrome version=1.1.0"
	@echo "  make versioned-full version=1.0.0"
	@echo "  make firefox"

.PHONY: default all chrome firefox source full-build versioned-full versioned-chrome versioned-firefox versioned-source check-version clean help