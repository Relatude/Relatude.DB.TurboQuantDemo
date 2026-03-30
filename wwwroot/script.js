(() => {
    function init() {
        const form = document.getElementById("searchForm");
        const termsInput = document.getElementById("terms");
        const semanticRatioInput = document.getElementById("semanticRatio");
        const semanticRatioValue = document.getElementById("semanticRatioValue");
        const iterationsInput = document.getElementById("iterations");
        const iterationsValue = document.getElementById("iterationsValue");
        const minimumCosineSimilarityInput = document.getElementById("minimumCosineSimilarity");
        const minimumCosineSimilarityValue = document.getElementById("minimumCosineSimilarityValue");
        const searchButton = document.getElementById("searchButton");
        const resetButton = document.getElementById("resetButton");
        const status = document.getElementById("status");
        const queryTime = document.getElementById("queryTime");
        const indexSizeMb = document.getElementById("indexSizeMb");
        const resultsMeta = document.getElementById("resultsMeta");
        const resultsList = document.getElementById("resultsList");
        const detailPanel = document.getElementById("detailPanel");

        if (!form || !termsInput || !semanticRatioInput || !semanticRatioValue || !iterationsInput || !iterationsValue || !minimumCosineSimilarityInput || !minimumCosineSimilarityValue || !searchButton || !resetButton || !status || !queryTime || !indexSizeMb || !resultsMeta || !resultsList || !detailPanel) {
            return;
        }

        let lastHits = [];
        let selectedIndex = -1;
        let autoSearchTimer = 0;

        function setStatus(message, type = "") {
            status.textContent = message;
            status.className = `status ${type}`.trim();
        }

        function sanitizeText(value) {
            if (!value) return "";
            return value
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#39;");
        }

        function toSnippet(body, maxLength = 120) {
            if (!body) return "";
            const compact = body.replace(/\s+/g, " ").trim();
            return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
        }

        function updateRangeLabels() {
            semanticRatioValue.textContent = Number(semanticRatioInput.value).toFixed(2);
            iterationsValue.textContent = iterationsInput.value;
            minimumCosineSimilarityValue.textContent = Number(minimumCosineSimilarityInput.value).toFixed(2);
        }
        function removeDoubleTitleInBodyStart(title, body) {
            return body.length > title.length ? body.slice(title.length + 1).trimStart() : body;
        }
        function renderDetail(index) {
            selectedIndex = index;

            if (index < 0 || index >= lastHits.length) {
                detailPanel.innerHTML = '<div class="empty">Select a result to see full content.</div>';
                return;
            }

            const hit = lastHits[index];
            detailPanel.innerHTML = `
            <h3 class="detail-title">${sanitizeText(hit.title)}</h3>
            <div class="detail-body">${sanitizeText(removeDoubleTitleInBodyStart(hit.title, hit.body))}</div>
        `;

            [...resultsList.querySelectorAll(".result-item")].forEach((el) => {
                const isActive = Number(el.dataset.index) === index;
                el.classList.toggle("active", isActive);
            });
        }

        function renderResults(hits) {
            if (!hits.length) {
                resultsList.innerHTML = '<div class="empty">No hits were returned for this query.</div>';
                renderDetail(-1);
                return;
            }

            const html = hits
                .map((hit, idx) => {
                    const title = sanitizeText(hit.title || "(Untitled)");
                    const snippet = sanitizeText(toSnippet(removeDoubleTitleInBodyStart(hit.title, hit.body)));
                    return `
                    <button type="button" class="result-item" data-index="${idx}">
                        <div class="result-title">${title}</div>
                        <div class="result-snippet">${snippet}</div>
                    </button>
                `;
                })
                .join("");

            resultsList.innerHTML = html;

            [...resultsList.querySelectorAll(".result-item")].forEach((button) => {
                button.addEventListener("click", () => {
                    renderDetail(Number(button.dataset.index));
                });
            });

            renderDetail(0);
        }

        function getPayload() {
            const useTurboQuant = document.querySelector("input[name='useTurboQuant']:checked")?.value === "true";
            return {
                terms: termsInput.value.trim(),
                semanticRatio: Number(semanticRatioInput.value),
                iterations: Number(iterationsInput.value),
                minimumCosineSimilarity: Number(minimumCosineSimilarityInput.value),
                useTurboQuant,
            };
        }

        async function runSearch() {
            const payload = getPayload();

            if (!payload.terms) {
                setStatus("Please enter search terms.", "error");
                return;
            }

            setStatus("Searching...");
            queryTime.textContent = "...";
            indexSizeMb.textContent = "...";
            searchButton.disabled = true;

            try {
                const response = await fetch("/search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error(`Search failed (${response.status}).`);
                }

                const data = await response.json();
                lastHits = Array.isArray(data.hits) ? data.hits : [];
                const totalHits = Number(data.totalHits ?? lastHits.length);
                const indexSize = Number(data.indexSizeMb ?? 0);

                const ms = Number(data.durationPerIterationMs ?? 0);
                queryTime.textContent = `${ms.toFixed(2)} ms`;
                indexSizeMb.textContent = `${indexSize.toFixed(0)} MB`;
                resultsMeta.textContent = `Showing ${lastHits.length} of ${totalHits} total hits`;

                renderResults(lastHits);
                setStatus("Search complete.", "ok");
            } catch (error) {
                lastHits = [];
                selectedIndex = -1;
                queryTime.textContent = "-- ms";
                indexSizeMb.textContent = "-- MB";
                resultsMeta.textContent = "Search failed.";
                resultsList.innerHTML = '<div class="empty">Unable to load results.</div>';
                detailPanel.innerHTML = '<div class="empty">No details available.</div>';
                setStatus(error instanceof Error ? error.message : "An unexpected error occurred.", "error");
            } finally {
                searchButton.disabled = false;
            }
        }

        function resetForm() {
            form.reset();
            semanticRatioInput.value = "1";
            iterationsInput.value = "1";
            minimumCosineSimilarityInput.value = "0.24";
            updateRangeLabels();
            lastHits = [];
            selectedIndex = -1;
            queryTime.textContent = "-- ms";
            indexSizeMb.textContent = "-- MB";
            resultsMeta.textContent = "No search executed yet.";
            resultsList.innerHTML = '<div class="empty">Run a search to see matching articles.</div>';
            detailPanel.innerHTML = '<div class="empty">Select a result to see full content.</div>';
            setStatus("");
            termsInput.focus();
        }

        function scheduleSearch() {
            window.clearTimeout(autoSearchTimer);
            autoSearchTimer = window.setTimeout(() => {
                if (termsInput.value.trim()) {
                    runSearch();
                }
            }, 250);
        }

        termsInput.addEventListener("input", scheduleSearch);
        semanticRatioInput.addEventListener("input", () => {
            updateRangeLabels();
            scheduleSearch();
        });
        iterationsInput.addEventListener("input", () => {
            updateRangeLabels();
            scheduleSearch();
        });
        minimumCosineSimilarityInput.addEventListener("input", () => {
            updateRangeLabels();
            scheduleSearch();
        });
        [...document.querySelectorAll("input[name='useTurboQuant']")].forEach((radio) => {
            radio.addEventListener("change", scheduleSearch);
        });
        searchButton.addEventListener("click", runSearch);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            runSearch();
        });
        resetButton.addEventListener("click", resetForm);

        updateRangeLabels();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
