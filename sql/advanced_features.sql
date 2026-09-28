-- Advanced feature engineering using a CTE and window functions
CREATE TABLE features_enriched AS
WITH contract_stats AS (
    SELECT
        customer_id,
        contract,
        tenure,
        monthly_charges,
        churn_value,
        ROUND(AVG(monthly_charges) OVER (PARTITION BY contract), 2) AS avg_charges_by_contract,
        RANK() OVER (PARTITION BY contract ORDER BY monthly_charges DESC) AS charge_rank_in_contract
    FROM features
)
SELECT
    *,
    ROUND(monthly_charges - avg_charges_by_contract, 2) AS charge_vs_contract_avg
FROM contract_stats;

SELECT * FROM features_enriched LIMIT 10;