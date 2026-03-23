export class RadiusMap {
    static render(container: HTMLElement, radiusM: number, competitors: number, totalPOI: number) {
        if (!container) return;

        const width = container.clientWidth || 600;
        const height = container.clientHeight || 320;
        const centerX = width / 2;
        const centerY = height / 2;

        // Visual radius occupies 80% of the container height
        const viewRadius = (height / 2) * 0.8;

        let svgContent = `<svg class="map-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

        // Glow effect defs
        svgContent += `
            <defs>
                <filter id="poiGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
        `;

        // Background Radius Circle
        svgContent += `<circle class="map-radius-circle" cx="${centerX}" cy="${centerY}" r="${viewRadius}" />`;

        // Scale indicator
        svgContent += `<text x="${centerX}" y="${centerY + viewRadius + 20}" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-weight="600">RADIUS: ${radiusM}m</text>`;

        // Random Other POIs (Dotted background)
        const displayPOI = Math.min(totalPOI, 150);
        for (let i = 0; i < displayPOI; i++) {
            const { x, y } = this.getRandomPoint(centerX, centerY, viewRadius);
            svgContent += `<circle class="map-poi" cx="${x}" cy="${y}" r="1.5" />`;
        }

        // Competitors (Highlighted)
        const displayComp = Math.min(competitors, 40);
        for (let i = 0; i < displayComp; i++) {
            const { x, y } = this.getRandomPoint(centerX, centerY, viewRadius);
            svgContent += `<circle class="map-competitor" cx="${x}" cy="${y}" r="3.5" />`;
        }

        // Center (Our Store)
        svgContent += `<circle class="map-center" cx="${centerX}" cy="${centerY}" r="6" />`;
        svgContent += `<circle cx="${centerX}" cy="${centerY}" r="12" fill="none" stroke="var(--accent-primary)" stroke-width="1" opacity="0.3">
            <animate attributeName="r" from="6" to="15" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>`;

        svgContent += '</svg>';

        // Add legend
        svgContent += `
            <div class="map-legend">
                <div class="legend-item">
                    <span class="legend-dot our"></span>
                    <span>분석 위치</span>
                </div>
                <div class="legend-item">
                    <span class="legend-dot comp"></span>
                    <span>동일 업종 (${competitors}개)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-dot poi"></span>
                    <span>주요 시설 (${totalPOI}개)</span>
                </div>
            </div>
        `;

        container.innerHTML = svgContent;
    }

    private static getRandomPoint(cx: number, cy: number, r: number) {
        const u = Math.random();
        const v = Math.random();
        const radius = r * Math.sqrt(u); // Uniform distribution in circle
        const theta = 2 * Math.PI * v;
        return {
            x: cx + radius * Math.cos(theta),
            y: cy + radius * Math.sin(theta)
        };
    }
}
