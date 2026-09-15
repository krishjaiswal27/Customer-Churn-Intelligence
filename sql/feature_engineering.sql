CREATE TABLE features AS
SELECT
    customer_id,
    gender,
    senior_citizen,
    partner,
    dependents,
    tenure,
    internet_service,
    contract,
    payment_method,
    monthly_charges,
    
    NULLIF(TRIM(total_charges), '')::NUMERIC AS total_charges,
    
    CASE 
        WHEN tenure <= 12 THEN '0-12m'
        WHEN tenure <= 24 THEN '12-24m'
        ELSE '24m+'
    END AS tenure_bucket,
    
    CASE WHEN churn = 'Yes' THEN 1 ELSE 0 END AS churn_value,
    
    CASE
        WHEN monthly_charges < 35 THEN 'Low'
        WHEN monthly_charges < 65 THEN 'Medium'
        ELSE 'High'
    END AS spend_tier

FROM telco_raw;

SELECT * FROM features LIMIT 5;
